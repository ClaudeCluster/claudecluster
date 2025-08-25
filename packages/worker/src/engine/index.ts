/**
 * @fileoverview Task execution engine with isolation for ClaudeCluster worker
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
  TaskContext 
} from '@claudecluster/core';
import { ClaudeCodeProcess, ClaudeProcessPool } from '../process/index.js';

/**
 * Task execution context with isolation
 */
export interface TaskExecutionContext extends TaskContext {
  readonly executionId: string;
  readonly isolatedWorkspace: string;
  readonly tempDirectory: string;
  readonly artifactsDirectory: string;
  readonly logsDirectory: string;
}

/**
 * Task execution options
 */
export interface TaskExecutionOptions {
  readonly enableIsolation: boolean;
  readonly captureOutput: boolean;
  readonly collectArtifacts: boolean;
  readonly streamProgress: boolean;
  readonly cleanupOnCompletion: boolean;
}

/**
 * Task execution events
 */
export interface TaskExecutionEvents {
  started: (task: Task, context: TaskExecutionContext) => void;
  progress: (task: Task, progress: TaskProgress) => void;
  output: (task: Task, output: string) => void;
  artifact: (task: Task, artifact: TaskArtifact) => void;
  completed: (task: Task, result: TaskResult) => void;
  failed: (task: Task, error: Error, result: TaskResult) => void;
}

/**
 * Task execution engine
 */
export class TaskExecutionEngine extends EventEmitter {
  private runningTasks = new Map<string, TaskExecution>();
  private processPool: ClaudeProcessPool;
  private defaultOptions: TaskExecutionOptions = {
    enableIsolation: true,
    captureOutput: true,
    collectArtifacts: true,
    streamProgress: true,
    cleanupOnCompletion: false // Keep artifacts for debugging
  };

  constructor(
    private baseWorkspaceDir: string,
    private baseTempDir: string,
    processPool: ClaudeProcessPool
  ) {
    super();
    this.processPool = processPool;
  }

  /**
   * Execute a task
   */
  async executeTask(
    task: Task,
    options: Partial<TaskExecutionOptions> = {}
  ): Promise<TaskResult> {
    const executionOptions = { ...this.defaultOptions, ...options };
    const executionId = `${task.id}-${randomUUID()}`;

    // Check if task is already running
    if (this.runningTasks.has(task.id)) {
      throw new Error(`Task ${task.id} is already running`);
    }

    // Create execution context
    const context = await this.createExecutionContext(task, executionId, executionOptions);
    
    // Create task execution
    const execution = new TaskExecution(task, context, executionOptions, this.processPool);
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
        taskId: task.id,
        status: TaskStatus.FAILED,
        error: error instanceof Error ? error.message : String(error),
        artifacts: [],
        metrics: execution.getMetrics(),
        logs: execution.getLogs(),
        startedAt: execution.getStartTime(),
        completedAt: new Date()
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
  } {
    const execution = this.runningTasks.get(taskId);
    if (!execution) {
      return { isRunning: false };
    }

    return {
      isRunning: true,
      progress: execution.getCurrentProgress(),
      metrics: execution.getMetrics()
    };
  }

  /**
   * Get all running tasks
   */
  getRunningTasks(): string[] {
    return Array.from(this.runningTasks.keys());
  }

  /**
   * Create isolated execution context
   */
  private async createExecutionContext(
    task: Task,
    executionId: string,
    options: TaskExecutionOptions
  ): Promise<TaskExecutionContext> {
    const baseDir = options.enableIsolation 
      ? join(this.baseWorkspaceDir, 'isolated', executionId)
      : this.baseWorkspaceDir;

    const context: TaskExecutionContext = {
      executionId,
      workingDirectory: task.context.workingDirectory || baseDir,
      isolatedWorkspace: baseDir,
      tempDirectory: join(this.baseTempDir, executionId),
      artifactsDirectory: join(baseDir, '.claudecluster', 'artifacts'),
      logsDirectory: join(baseDir, '.claudecluster', 'logs'),
      timeout: task.context.timeout,
      retryCount: task.context.retryCount,
      environment: task.context.environment,
      resourceLimits: task.context.resourceLimits
    };

    // Create directories
    await Promise.all([
      fs.mkdir(context.isolatedWorkspace, { recursive: true }),
      fs.mkdir(context.tempDirectory, { recursive: true }),
      fs.mkdir(context.artifactsDirectory, { recursive: true }),
      fs.mkdir(context.logsDirectory, { recursive: true })
    ]);

    // Copy workspace files if isolation is enabled
    if (options.enableIsolation && task.context.workingDirectory) {
      await this.copyWorkspaceFiles(task.context.workingDirectory, context.isolatedWorkspace);
    }

    return context;
  }

  /**
   * Copy workspace files for isolation
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
      // Log error but don't fail the task
      console.warn(`Failed to copy workspace files: ${error}`);
    }
  }

  /**
   * Set up event forwarding from execution to engine
   */
  private setupEventForwarding(execution: TaskExecution): void {
    execution.on('started', (task: Task, context: TaskExecutionContext) => this.emit('started', task, context));
    execution.on('progress', (task: Task, progress: TaskProgress) => this.emit('progress', task, progress));
    execution.on('output', (task: Task, output: string) => this.emit('output', task, output));
    execution.on('artifact', (task: Task, artifact: TaskArtifact) => this.emit('artifact', task, artifact));
  }

  /**
   * Cleanup execution context
   */
  private async cleanup(context: TaskExecutionContext): Promise<void> {
    try {
      await Promise.all([
        fs.rm(context.isolatedWorkspace, { recursive: true, force: true }),
        fs.rm(context.tempDirectory, { recursive: true, force: true })
      ]);
    } catch (error) {
      // Log error but don't fail
      console.warn(`Cleanup failed: ${error}`);
    }
  }
}

/**
 * Individual task execution
 */
class TaskExecution extends EventEmitter {
  private process?: ClaudeCodeProcess;
  private startTime: Date;
  private endTime?: Date;
  private currentProgress: TaskProgress;
  private outputLogs: string[] = [];
  private artifacts: TaskArtifact[] = [];
  private cancelled = false;

  constructor(
    private task: Task,
    private context: TaskExecutionContext,
    private options: TaskExecutionOptions,
    private processPool: ClaudeProcessPool
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
   * Execute the task
   */
  async execute(): Promise<TaskResult> {
    try {
      // Get process from pool
      this.process = await this.processPool.getProcess();
      
      // Emit started event
      this.emit('started', this.task, this.context);
      
      // Set up process event handlers
      this.setupProcessHandlers();
      
      // Execute task steps
      await this.executeTaskSteps();
      
      // Collect artifacts if enabled
      if (this.options.collectArtifacts) {
        await this.collectArtifacts();
      }
      
      this.endTime = new Date();
      
      // Create successful result
      const result: TaskResult = {
        taskId: this.task.id,
        status: TaskStatus.COMPLETED,
        output: this.outputLogs.join('\n'),
        artifacts: this.artifacts,
        metrics: this.getMetrics(),
        logs: this.getLogs(),
        startedAt: this.startTime,
        completedAt: this.endTime
      };
      
      return result;
    } catch (error) {
      this.endTime = new Date();
      throw error;
    } finally {
      // Return process to pool
      if (this.process) {
        this.processPool.releaseProcess(this.process);
      }
    }
  }

  /**
   * Cancel task execution
   */
  async cancel(): Promise<void> {
    this.cancelled = true;
    if (this.process) {
      await this.process.stop();
    }
  }

  /**
   * Execute task steps
   */
  private async executeTaskSteps(): Promise<void> {
    if (!this.process) {
      throw new Error('No process available');
    }

    // Update progress
    this.updateProgress(10, 'Preparing workspace', 1, 0);

    // Change to working directory
    await this.executeCommand(`cd "${this.context.isolatedWorkspace}"`);
    
    // Update progress
    this.updateProgress(20, 'Setting up environment', 2, 1);
    
    // Set environment variables if specified
    if (this.context.environment) {
      for (const [key, value] of Object.entries(this.context.environment)) {
        await this.executeCommand(`export ${key}="${value}"`);
      }
    }
    
    // Update progress
    this.updateProgress(30, 'Executing task', 3, 2);
    
    // Execute the main task
    await this.executeMainTask();
    
    // Update progress
    this.updateProgress(90, 'Finalizing', 4, 3);
    
    // Finalize execution
    await this.finalizeExecution();
    
    // Complete
    this.updateProgress(100, 'Completed', 4, 4);
  }

  /**
   * Execute the main task logic
   */
  private async executeMainTask(): Promise<void> {
    if (!this.process) {
      throw new Error('No process available');
    }

    // Generate Claude Code prompt based on task
    const prompt = this.generateClaudePrompt();
    
    // Execute the prompt
    const result = await this.process.executeCommand(
      prompt,
      this.context.timeout || 300000 // 5 minutes default
    );
    
    if (result.exitCode !== 0 && result.error) {
      throw new Error(`Task execution failed: ${result.error}`);
    }
    
    // Process output
    for (const output of result.output) {
      this.outputLogs.push(output.data);
      if (this.options.captureOutput) {
        this.emit('output', this.task, output.data);
      }
    }
  }

  /**
   * Generate Claude Code prompt from task
   */
  private generateClaudePrompt(): string {
    const { title, description, category } = this.task;
    
    // Basic prompt generation - can be enhanced based on task category
    let prompt = `# Task: ${title}\n\n`;
    prompt += `## Description\n${description}\n\n`;
    prompt += `## Category\n${category}\n\n`;
    prompt += `## Instructions\n`;
    prompt += `Please execute this task in the current workspace. `;
    prompt += `Ensure all changes are saved and any generated files are properly organized.\n\n`;
    
    // Add category-specific instructions
    switch (category) {
      case 'code':
        prompt += `Focus on writing clean, well-documented code.\n`;
        break;
      case 'test':
        prompt += `Write comprehensive tests with good coverage.\n`;
        break;
      case 'refactor':
        prompt += `Improve code quality while maintaining functionality.\n`;
        break;
      case 'document':
        prompt += `Create clear, comprehensive documentation.\n`;
        break;
      default:
        prompt += `Follow best practices for this type of task.\n`;
    }
    
    return prompt;
  }

  /**
   * Execute a command and handle errors
   */
  private async executeCommand(command: string): Promise<void> {
    if (this.cancelled) {
      throw new Error('Task was cancelled');
    }

    if (!this.process) {
      throw new Error('No process available');
    }

    const result = await this.process.executeCommand(command, 30000); // 30 second timeout
    
    if (result.exitCode !== 0 && result.error) {
      throw new Error(`Command failed: ${command} - ${result.error}`);
    }
  }

  /**
   * Finalize execution
   */
  private async finalizeExecution(): Promise<void> {
    // Save execution log
    const logFile = join(this.context.logsDirectory, `execution-${this.context.executionId}.log`);
    await fs.writeFile(logFile, this.outputLogs.join('\n'));
  }

  /**
   * Collect artifacts from the workspace
   */
  private async collectArtifacts(): Promise<void> {
    try {
      const workspaceFiles = await this.scanWorkspaceFiles(this.context.isolatedWorkspace);
      
      for (const file of workspaceFiles) {
        const stats = await fs.stat(file.path);
        const content = await fs.readFile(file.path);
        const checksum = createHash('sha256').update(content).digest('hex');
        
        // Copy to artifacts directory
        const artifactPath = join(this.context.artifactsDirectory, file.relativePath);
        await fs.mkdir(dirname(artifactPath), { recursive: true });
        await fs.copyFile(file.path, artifactPath);
        
        const artifact: TaskArtifact = {
          id: randomUUID(),
          type: this.determineArtifactType(file.path),
          name: file.name,
          path: file.relativePath,
          size: stats.size,
          checksum,
          createdAt: new Date(),
          metadata: {
            originalPath: file.path,
            mimeType: this.getMimeType(file.path)
          }
        };
        
        this.artifacts.push(artifact);
        this.emit('artifact', this.task, artifact);
      }
    } catch (error) {
      console.warn(`Failed to collect artifacts: ${error}`);
    }
  }

  /**
   * Scan workspace for files
   */
  private async scanWorkspaceFiles(dir: string): Promise<Array<{
    path: string;
    name: string;
    relativePath: string;
  }>> {
    const files: Array<{ path: string; name: string; relativePath: string }> = [];
    
    const scanDir = async (currentDir: string): Promise<void> => {
      const entries = await fs.readdir(currentDir, { withFileTypes: true });
      
      for (const entry of entries) {
        const fullPath = join(currentDir, entry.name);
        
        // Skip system directories
        if (entry.name.startsWith('.claudecluster') || entry.name.startsWith('.git')) {
          continue;
        }
        
        if (entry.isDirectory()) {
          await scanDir(fullPath);
        } else if (entry.isFile()) {
          files.push({
            path: fullPath,
            name: entry.name,
            relativePath: relative(this.context.isolatedWorkspace, fullPath)
          });
        }
      }
    };
    
    await scanDir(dir);
    return files;
  }

  /**
   * Determine artifact type based on file path
   */
  private determineArtifactType(filePath: string): TaskArtifact['type'] {
    const ext = filePath.split('.').pop()?.toLowerCase();
    
    switch (ext) {
      case 'md':
      case 'txt':
      case 'log':
        return 'report';
      case 'js':
      case 'ts':
      case 'py':
      case 'java':
      case 'cpp':
      case 'c':
        return 'file';
      default:
        return 'data';
    }
  }

  /**
   * Get MIME type for file
   */
  private getMimeType(filePath: string): string {
    const ext = filePath.split('.').pop()?.toLowerCase();
    
    const mimeTypes: Record<string, string> = {
      'js': 'text/javascript',
      'ts': 'text/typescript',
      'py': 'text/x-python',
      'md': 'text/markdown',
      'txt': 'text/plain',
      'json': 'application/json',
      'html': 'text/html',
      'css': 'text/css'
    };
    
    return mimeTypes[ext || ''] || 'application/octet-stream';
  }

  /**
   * Set up process event handlers
   */
  private setupProcessHandlers(): void {
    if (!this.process) return;
    
    this.process.on('output', (output: any) => {
      if (this.options.captureOutput) {
        this.emit('output', this.task, output.data);
      }
    });
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
      duration: endTime.getTime() - this.startTime.getTime(),
      filesModified: this.artifacts.length,
      linesOfCodeProcessed: this.estimateLinesOfCode(),
      errorCount: 0 // Could be enhanced to track actual errors
    };
  }

  /**
   * Get execution logs
   */
  getLogs(): readonly string[] {
    return [...this.outputLogs];
  }

  /**
   * Get execution start time
   */
  getStartTime(): Date {
    return this.startTime;
  }

  /**
   * Estimate lines of code processed
   */
  private estimateLinesOfCode(): number {
    // Simple estimation based on output length
    return this.outputLogs.join('\n').split('\n').length;
  }
}