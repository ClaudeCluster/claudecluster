/**
 * @fileoverview Unified Task Execution Engine
 * 
 * Refactored TaskExecutionEngine that uses UnifiedExecutionProvider to support
 * both process pool and container execution modes while maintaining backward compatibility.
 */

import { EventEmitter } from 'events';
import { promises as fs } from 'fs';
import { join, resolve, dirname, relative } from 'path';
import { createHash, randomUUID } from 'crypto';
import { TaskStatus } from '@claudecluster/core';
import type { 
  Task, 
  TaskResult, 
  TaskProgress, 
  TaskMetrics,
  TaskArtifact,
  TaskContext,
  WorkerConfig
} from '@claudecluster/core';

import {
  UnifiedExecutionProvider,
  ExecutionMode,
  ExecutorState,
  type ExecutionFeatureFlags,
  type Executor
} from '../execution/index.js';

/**
 * Session configuration for container mode
 */
export interface SessionOptions {
  readonly repoUrl?: string;
  readonly timeout?: number; // seconds
  readonly resourceLimits?: {
    memory?: number;
    cpu?: number;
  };
  readonly environment?: Record<string, string>;
}

/**
 * Active session information
 */
interface ActiveSession {
  executor: Executor;
  createdAt: number;
  expiresAt: number;
  lastActivity: number;
  task?: Task;
}

/**
 * Task execution context with isolation (enhanced for dual mode)
 */
export interface UnifiedTaskExecutionContext extends TaskContext {
  readonly executionId: string;
  readonly executionMode: ExecutionMode;
  readonly sessionId?: string;
  readonly isolatedWorkspace: string;
  readonly tempDirectory: string;
  readonly artifactsDirectory: string;
  readonly logsDirectory: string;
}

/**
 * Enhanced task execution options
 */
export interface UnifiedTaskExecutionOptions {
  readonly enableIsolation: boolean;
  readonly captureOutput: boolean;
  readonly collectArtifacts: boolean;
  readonly streamProgress: boolean;
  readonly cleanupOnCompletion: boolean;
  readonly executionMode?: ExecutionMode;
  readonly sessionId?: string; // For container mode
  readonly createSession?: boolean; // Auto-create session for container mode
}

/**
 * Unified task execution events
 */
export interface UnifiedTaskExecutionEvents {
  started: (task: Task, context: UnifiedTaskExecutionContext) => void;
  progress: (task: Task, progress: TaskProgress) => void;
  output: (task: Task, output: string) => void;
  artifact: (task: Task, artifact: TaskArtifact) => void;
  completed: (task: Task, result: TaskResult) => void;
  failed: (task: Task, error: Error, result: TaskResult) => void;
  'session-created': (sessionId: string) => void;
  'session-expired': (sessionId: string) => void;
  'session-cleaned': (sessionId: string) => void;
}

/**
 * Unified Task Execution Engine
 * 
 * Supports both process pool and container execution modes through
 * the UnifiedExecutionProvider abstraction.
 */
export class UnifiedTaskExecutionEngine extends EventEmitter {
  private executionProvider: UnifiedExecutionProvider;
  private runningTasks = new Map<string, UnifiedTaskExecution>();
  private sessions = new Map<string, ActiveSession>();
  private sessionCleanupInterval?: NodeJS.Timeout;
  
  private defaultOptions: UnifiedTaskExecutionOptions = {
    enableIsolation: true,
    captureOutput: true,
    collectArtifacts: true,
    streamProgress: true,
    cleanupOnCompletion: false,
    createSession: false
  };

  constructor(
    private config: WorkerConfig,
    private baseWorkspaceDir: string = './workspace',
    private baseTempDir: string = './temp'
  ) {
    super();
    
    // Initialize the unified execution provider
    this.executionProvider = new UnifiedExecutionProvider(config);
    
    // Start session cleanup interval for container mode
    this.startSessionCleanup();
    
    // Handle shutdown gracefully
    process.on('SIGINT', () => this.shutdown());
    process.on('SIGTERM', () => this.shutdown());
  }

  /**
   * Execute a task using the appropriate execution mode
   */
  async executeTask(
    task: Task,
    options: Partial<UnifiedTaskExecutionOptions> = {}
  ): Promise<TaskResult> {
    const executionOptions = { ...this.defaultOptions, ...options };
    const executionId = `${task.id}-${randomUUID()}`;
    
    // Determine execution mode
    const executionMode = executionOptions.executionMode || 
                         task.context?.executionMode as ExecutionMode ||
                         this.config.executionMode;

    // Check if task is already running
    if (this.runningTasks.has(task.id)) {
      throw new Error(`Task ${task.id} is already running`);
    }

    // Handle session-based execution for container mode
    let sessionId: string | undefined;
    if (executionMode === ExecutionMode.CONTAINER_AGENTIC) {
      if (executionOptions.sessionId) {
        sessionId = executionOptions.sessionId;
        await this.validateSession(sessionId);
      } else if (executionOptions.createSession) {
        sessionId = await this.createSession({
          repoUrl: task.context?.repoUrl,
          timeout: task.context?.timeout,
          environment: task.context?.environment
        });
      }
    }

    // Create execution context
    const context = await this.createExecutionContext(
      task, 
      executionId, 
      executionMode,
      sessionId,
      executionOptions
    );
    
    // Create unified task execution
    const execution = new UnifiedTaskExecution(
      task, 
      context, 
      executionOptions, 
      this.executionProvider
    );
    this.runningTasks.set(task.id, execution);

    try {
      // Set up event forwarding
      this.setupEventForwarding(execution);

      // Execute the task
      const result = await execution.execute();
      
      this.emit('completed', task, result);
      return result;
      
    } catch (error) {
      const failedResult: TaskResult = {
        id: randomUUID(),
        taskId: task.id,
        status: TaskStatus.FAILED,
        result: {
          success: false,
          error: error instanceof Error ? error.message : String(error),
          artifacts: [],
          metadata: {
            executionMode,
            sessionId,
            executionId
          }
        },
        executionTime: execution.getExecutionTime(),
        completedAt: new Date(),
        error: error instanceof Error ? error.message : String(error)
      };
      
      this.emit('failed', task, error instanceof Error ? error : new Error(String(error)), failedResult);
      throw error;
      
    } finally {
      this.runningTasks.delete(task.id);
      
      // Cleanup if requested
      if (executionOptions.cleanupOnCompletion) {
        await this.cleanup(context);
      }
    }
  }

  /**
   * Create a new session for container-based execution
   */
  async createSession(options: SessionOptions = {}): Promise<string> {
    if (this.config.executionMode !== ExecutionMode.CONTAINER_AGENTIC &&
        !this.config.featureFlags?.enableContainerMode) {
      throw new Error('Session creation requires container execution mode');
    }

    const sessionId = randomUUID();
    const timeout = (options.timeout || 3600) * 1000; // Convert to milliseconds
    
    try {
      // Create a session initialization task
      const sessionTask: Task = {
        id: `session-init-${sessionId}`,
        title: 'Initialize Session',
        description: 'Initialize container session for agentic execution',
        category: 'system' as any,
        priority: 'medium' as any,
        status: TaskStatus.PENDING,
        dependencies: [],
        context: {
          executionMode: ExecutionMode.CONTAINER_AGENTIC,
          sessionId,
          repoUrl: options.repoUrl,
          environment: options.environment,
          resourceLimits: options.resourceLimits ? {
            maxMemoryMB: options.resourceLimits.memory ? Math.round(options.resourceLimits.memory / (1024 * 1024)) : undefined,
            maxCpuPercent: options.resourceLimits.cpu ? Math.round(options.resourceLimits.cpu) : undefined
          } : undefined
        },
        createdAt: new Date(),
        updatedAt: new Date()
      };

      // Get executor from provider (this creates the container)
      const executor = await this.executionProvider.getExecutor(sessionTask, ExecutionMode.CONTAINER_AGENTIC);
      
      // Store session information
      const session: ActiveSession = {
        executor,
        createdAt: Date.now(),
        expiresAt: Date.now() + timeout,
        lastActivity: Date.now()
      };
      
      this.sessions.set(sessionId, session);
      
      this.emit('session-created', sessionId);
      return sessionId;
      
    } catch (error) {
      throw new Error(`Failed to create session: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Execute task in an existing session
   */
  async executeInSession(sessionId: string, task: Task): Promise<TaskResult> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Session ${sessionId} not found`);
    }

    if (Date.now() > session.expiresAt) {
      await this.cleanupSession(sessionId);
      throw new Error(`Session ${sessionId} has expired`);
    }

    // Update last activity
    session.lastActivity = Date.now();
    session.task = task;

    // Execute task using the session's executor
    return await session.executor.execute(task);
  }

  /**
   * End a session and clean up resources
   */
  async endSession(sessionId: string): Promise<void> {
    await this.cleanupSession(sessionId);
  }

  /**
   * Cancel a running task
   */
  async cancelTask(taskId: string): Promise<boolean> {
    const execution = this.runningTasks.get(taskId);
    if (!execution) {
      return false;
    }

    await execution.cancel();
    this.runningTasks.delete(taskId);
    return true;
  }

  /**
   * Get task execution status
   */
  getTaskStatus(taskId: string): {
    isRunning: boolean;
    progress?: TaskProgress;
    metrics?: TaskMetrics;
    executionMode?: ExecutionMode;
    sessionId?: string;
  } {
    const execution = this.runningTasks.get(taskId);
    if (!execution) {
      return { isRunning: false };
    }

    const context = execution.getContext();
    return {
      isRunning: true,
      progress: execution.getCurrentProgress(),
      metrics: execution.getMetrics(),
      executionMode: context.executionMode,
      sessionId: context.sessionId
    };
  }

  /**
   * Get all running tasks
   */
  getRunningTasks(): string[] {
    return Array.from(this.runningTasks.keys());
  }

  /**
   * Get active sessions
   */
  getActiveSessions(): Array<{
    sessionId: string;
    createdAt: Date;
    expiresAt: Date;
    lastActivity: Date;
    currentTask?: string;
  }> {
    return Array.from(this.sessions.entries()).map(([sessionId, session]) => ({
      sessionId,
      createdAt: new Date(session.createdAt),
      expiresAt: new Date(session.expiresAt),
      lastActivity: new Date(session.lastActivity),
      currentTask: session.task?.id
    }));
  }

  /**
   * Get execution provider statistics
   */
  getProviderStats() {
    return this.executionProvider.getStats();
  }

  /**
   * Shutdown the engine and clean up all resources
   */
  async shutdown(): Promise<void> {
    // Stop session cleanup interval
    if (this.sessionCleanupInterval) {
      clearInterval(this.sessionCleanupInterval);
      this.sessionCleanupInterval = undefined;
    }

    // Cancel all running tasks
    const cancelPromises = Array.from(this.runningTasks.keys()).map(taskId => 
      this.cancelTask(taskId).catch(error => 
        console.error(`Failed to cancel task ${taskId}:`, error)
      )
    );
    await Promise.allSettled(cancelPromises);

    // Clean up all sessions
    const sessionCleanupPromises = Array.from(this.sessions.keys()).map(sessionId =>
      this.cleanupSession(sessionId).catch(error =>
        console.error(`Failed to cleanup session ${sessionId}:`, error)
      )
    );
    await Promise.allSettled(sessionCleanupPromises);

    // Shutdown the execution provider
    await this.executionProvider.cleanup();
  }

  /**
   * Create unified execution context
   */
  private async createExecutionContext(
    task: Task,
    executionId: string,
    executionMode: ExecutionMode,
    sessionId: string | undefined,
    options: UnifiedTaskExecutionOptions
  ): Promise<UnifiedTaskExecutionContext> {
    const baseDir = options.enableIsolation 
      ? join(this.baseWorkspaceDir, 'isolated', executionId)
      : this.baseWorkspaceDir;

    const context: UnifiedTaskExecutionContext = {
      executionId,
      executionMode,
      sessionId,
      workingDirectory: task.context?.workingDirectory || baseDir,
      isolatedWorkspace: baseDir,
      tempDirectory: join(this.baseTempDir, executionId),
      artifactsDirectory: join(baseDir, '.claudecluster', 'artifacts'),
      logsDirectory: join(baseDir, '.claudecluster', 'logs'),
      timeout: task.context?.timeout,
      retryCount: task.context?.retryCount,
      environment: task.context?.environment,
      resourceLimits: task.context?.resourceLimits
    };

    // Create directories for process mode (container mode handles its own workspace)
    if (executionMode === ExecutionMode.PROCESS_POOL) {
      await Promise.all([
        fs.mkdir(context.isolatedWorkspace, { recursive: true }),
        fs.mkdir(context.tempDirectory, { recursive: true }),
        fs.mkdir(context.artifactsDirectory, { recursive: true }),
        fs.mkdir(context.logsDirectory, { recursive: true })
      ]);

      // Copy workspace files if isolation is enabled
      if (options.enableIsolation && task.context?.workingDirectory) {
        await this.copyWorkspaceFiles(task.context.workingDirectory, context.isolatedWorkspace);
      }
    }

    return context;
  }

  /**
   * Copy workspace files for isolation (process mode only)
   */
  private async copyWorkspaceFiles(source: string, destination: string): Promise<void> {
    try {
      const sourceStats = await fs.stat(source);
      if (!sourceStats.isDirectory()) {
        return;
      }

      const entries = await fs.readdir(source, { withFileTypes: true });
      
      for (const entry of entries) {
        const sourcePath = join(source, entry.name);
        const destPath = join(destination, entry.name);
        
        // Skip hidden directories and common exclusions
        if (entry.name.startsWith('.') || 
            entry.name === 'node_modules' || 
            entry.name === 'dist' ||
            entry.name === 'build') {
          continue;
        }

        if (entry.isDirectory()) {
          await fs.mkdir(destPath, { recursive: true });
          await this.copyWorkspaceFiles(sourcePath, destPath);
        } else if (entry.isFile()) {
          await fs.copyFile(sourcePath, destPath);
        }
      }
    } catch (error) {
      console.warn(`Failed to copy workspace files: ${error}`);
    }
  }

  /**
   * Validate that a session exists and is active
   */
  private async validateSession(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Session ${sessionId} not found`);
    }

    if (Date.now() > session.expiresAt) {
      await this.cleanupSession(sessionId);
      throw new Error(`Session ${sessionId} has expired`);
    }

    // Check if executor is still healthy
    if (!session.executor.isHealthy()) {
      await this.cleanupSession(sessionId);
      throw new Error(`Session ${sessionId} executor is unhealthy`);
    }
  }

  /**
   * Clean up a session and its resources
   */
  private async cleanupSession(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return;
    }

    try {
      // Release executor back to provider
      await this.executionProvider.release(session.executor);
    } catch (error) {
      console.error(`Failed to release executor for session ${sessionId}:`, error);
    }

    this.sessions.delete(sessionId);
    this.emit('session-cleaned', sessionId);
  }

  /**
   * Start periodic session cleanup
   */
  private startSessionCleanup(): void {
    this.sessionCleanupInterval = setInterval(async () => {
      const now = Date.now();
      const expiredSessions: string[] = [];

      for (const [sessionId, session] of this.sessions.entries()) {
        if (now > session.expiresAt) {
          expiredSessions.push(sessionId);
        }
      }

      for (const sessionId of expiredSessions) {
        this.emit('session-expired', sessionId);
        await this.cleanupSession(sessionId);
      }
    }, 60000); // Check every minute
  }

  /**
   * Set up event forwarding from execution to engine
   */
  private setupEventForwarding(execution: UnifiedTaskExecution): void {
    execution.on('started', (task: Task, context: UnifiedTaskExecutionContext) => 
      this.emit('started', task, context));
    execution.on('progress', (task: Task, progress: TaskProgress) => 
      this.emit('progress', task, progress));
    execution.on('output', (task: Task, output: string) => 
      this.emit('output', task, output));
    execution.on('artifact', (task: Task, artifact: TaskArtifact) => 
      this.emit('artifact', task, artifact));
  }

  /**
   * Cleanup execution context
   */
  private async cleanup(context: UnifiedTaskExecutionContext): Promise<void> {
    // Only cleanup local files for process mode
    if (context.executionMode === ExecutionMode.PROCESS_POOL) {
      try {
        await Promise.all([
          fs.rm(context.isolatedWorkspace, { recursive: true, force: true }),
          fs.rm(context.tempDirectory, { recursive: true, force: true })
        ]);
      } catch (error) {
        console.warn(`Cleanup failed: ${error}`);
      }
    }
  }
}

/**
 * Unified individual task execution
 */
class UnifiedTaskExecution extends EventEmitter {
  private executor?: Executor;
  private startTime: Date;
  private endTime?: Date;
  private currentProgress: TaskProgress;
  private cancelled = false;

  constructor(
    private task: Task,
    private context: UnifiedTaskExecutionContext,
    private options: UnifiedTaskExecutionOptions,
    private executionProvider: UnifiedExecutionProvider
  ) {
    super();
    this.startTime = new Date();
    this.currentProgress = {
      percentage: 0,
      currentStep: 'Initializing',
      totalSteps: 1,
      completedSteps: 0
    };
  }

  /**
   * Execute the task using the unified provider
   */
  async execute(): Promise<TaskResult> {
    try {
      // Get executor from provider
      this.executor = await this.executionProvider.getExecutor(this.task, this.context.executionMode);
      
      // Emit started event
      this.emit('started', this.task, this.context);
      
      // Update progress
      this.updateProgress(10, 'Executor acquired', 3, 1);
      
      // Execute task with executor
      this.updateProgress(50, 'Executing task', 3, 2);
      const result = await this.executor.execute(this.task);
      
      // Finalize
      this.updateProgress(100, 'Completed', 3, 3);
      this.endTime = new Date();
      
      return result;
      
    } catch (error) {
      this.endTime = new Date();
      throw error;
    } finally {
      // Return executor to provider
      if (this.executor) {
        try {
          await this.executionProvider.release(this.executor);
        } catch (error) {
          console.error('Failed to release executor:', error);
        }
      }
    }
  }

  /**
   * Cancel task execution
   */
  async cancel(): Promise<void> {
    this.cancelled = true;
    if (this.executor) {
      await this.executor.terminate();
    }
  }

  /**
   * Get execution context
   */
  getContext(): UnifiedTaskExecutionContext {
    return this.context;
  }

  /**
   * Get execution time in milliseconds
   */
  getExecutionTime(): number {
    const endTime = this.endTime || new Date();
    return endTime.getTime() - this.startTime.getTime();
  }

  /**
   * Update task progress
   */
  private updateProgress(
    percentage: number,
    currentStep: string,
    totalSteps: number,
    completedSteps: number
  ): void {
    this.currentProgress = {
      percentage,
      currentStep,
      totalSteps,
      completedSteps,
      estimatedTimeRemaining: this.calculateEstimatedTimeRemaining(percentage)
    };
    
    if (this.options.streamProgress) {
      this.emit('progress', this.task, this.currentProgress);
    }
  }

  /**
   * Calculate estimated time remaining
   */
  private calculateEstimatedTimeRemaining(percentage: number): number | undefined {
    if (percentage <= 0) return undefined;
    
    const elapsed = Date.now() - this.startTime.getTime();
    const estimated = (elapsed / percentage) * 100;
    return Math.max(0, estimated - elapsed);
  }

  /**
   * Get current progress
   */
  getCurrentProgress(): TaskProgress {
    return this.currentProgress;
  }

  /**
   * Get execution metrics
   */
  getMetrics(): TaskMetrics {
    const now = new Date();
    const endTime = this.endTime || now;
    
    return {
      startTime: this.startTime,
      endTime: this.endTime,
      duration: endTime.getTime() - this.startTime.getTime()
    };
  }
}

// Backward compatibility export
export { UnifiedTaskExecutionEngine as TaskExecutionEngine };
export default UnifiedTaskExecutionEngine;