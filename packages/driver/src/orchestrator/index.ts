/**
 * @fileoverview Orchestrator for coordinating task execution across workers
 */

import { EventEmitter2 as EventEmitter } from 'eventemitter2';
import axios, { type AxiosInstance } from 'axios';
import type { Task, TaskResult, Worker, Driver, TaskProgress } from '@claudecluster/core';
import { TaskStatus, WorkerStatus, DriverStatus } from '@claudecluster/core';
import { TaskScheduler, type SchedulerConfig, type TaskExecutionPlan } from '../scheduler/index.js';
import { ExecutionMode } from '@claudecluster/worker';

/**
 * Session options for container mode execution
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
 * Orchestrator configuration
 */
export interface OrchestratorConfig {
  readonly driverId: string;
  readonly maxConcurrentTasks: number;
  readonly taskTimeout: number;
  readonly workerHealthCheckInterval: number;
  readonly resultAggregationTimeout: number;
  readonly enableTaskDecomposition: boolean;
  readonly enableResultMerging: boolean;
  readonly retryFailedTasks: boolean;
  readonly schedulerConfig?: Partial<SchedulerConfig>;
}

/**
 * Default orchestrator configuration
 */
export const DEFAULT_ORCHESTRATOR_CONFIG: OrchestratorConfig = {
  driverId: 'default-driver',
  maxConcurrentTasks: 100,
  taskTimeout: 600000, // 10 minutes
  workerHealthCheckInterval: 30000, // 30 seconds
  resultAggregationTimeout: 5000, // 5 seconds
  enableTaskDecomposition: true,
  enableResultMerging: true,
  retryFailedTasks: true
};

/**
 * Task execution context
 */
export interface TaskExecutionContext {
  readonly taskId: string;
  readonly workerId: string;
  readonly startTime: Date;
  readonly timeout?: NodeJS.Timeout;
  readonly httpClient: AxiosInstance;
  progress: number;
  status: TaskStatus;
  result?: TaskResult;
  error?: Error;
}

/**
 * Orchestrator events
 */
export interface OrchestratorEvents {
  'task-submitted': (task: Task) => void;
  'task-started': (taskId: string, workerId: string) => void;
  'task-progress': (taskId: string, progress: TaskProgress) => void;
  'task-completed': (taskId: string, result: TaskResult) => void;
  'task-failed': (taskId: string, error: Error) => void;
  'worker-registered': (worker: Worker) => void;
  'worker-unregistered': (workerId: string) => void;
  'worker-health-changed': (workerId: string, isHealthy: boolean) => void;
  'orchestration-started': () => void;
  'orchestration-stopped': () => void;
  'stats-updated': (stats: OrchestrationStats) => void;
  'session-created': (sessionId: string, workerId: string) => void;
  'session-expired': (sessionId: string) => void;
  'session-terminated': (sessionId: string) => void;
}

/**
 * Orchestration statistics
 */
export interface OrchestrationStats {
  readonly totalTasks: number;
  readonly completedTasks: number;
  readonly failedTasks: number;
  readonly runningTasks: number;
  readonly queuedTasks: number;
  readonly totalWorkers: number;
  readonly activeWorkers: number;
  readonly averageTaskDuration: number;
  readonly successRate: number;
  readonly throughput: number;
  readonly uptime: number;
  readonly activeSessions: number;
  readonly totalSessionsCreated: number;
  readonly expiredSessions: number;
}

/**
 * Task decomposition result
 */
interface DecomposedTask {
  readonly subtasks: Task[];
  readonly mergeStrategy: 'concat' | 'merge' | 'reduce' | 'custom';
  readonly customMerger?: (results: TaskResult[]) => TaskResult;
}

/**
 * Session information for container mode execution
 */
export interface Session {
  readonly id: string;
  readonly workerId: string;
  readonly createdAt: number;
  readonly expiresAt: number;
  lastActivity: number;
  readonly options: SessionOptions;
}

/**
 * Session creation response
 */
export interface SessionCreationResponse {
  readonly sessionId: string;
  readonly workerId: string;
  readonly endpoint: string;
}

/**
 * Orchestrator implementation
 */
export class TaskOrchestrator extends EventEmitter<OrchestratorEvents> implements Driver {
  readonly id: string;
  readonly name: string;
  readonly version: string;
  readonly status: DriverStatus;
  readonly createdAt: Date;
  
  private readonly config: OrchestratorConfig;
  private readonly scheduler: TaskScheduler;
  private readonly executionContexts = new Map<string, TaskExecutionContext>();
  private readonly taskResults = new Map<string, TaskResult>();
  private readonly taskErrors = new Map<string, Error>();
  private readonly sessions = new Map<string, Session>();
  
  private _status: DriverStatus = DriverStatus.INITIALIZING;
  private healthCheckInterval?: NodeJS.Timeout;
  private statsInterval?: NodeJS.Timeout;
  private startTime: Date;
  private stats: OrchestrationStats;
  private totalSessionsCreated = 0;
  private expiredSessionsCount = 0;

  constructor(config: Partial<OrchestratorConfig> = {}) {
    super();
    
    this.config = { ...DEFAULT_ORCHESTRATOR_CONFIG, ...config };
    this.id = this.config.driverId;
    this.name = `Orchestrator-${this.id}`;
    this.version = '0.1.0';
    this.status = this._status;
    this.createdAt = new Date();
    this.startTime = new Date();
    
    // Initialize scheduler
    this.scheduler = new TaskScheduler(this.config.schedulerConfig);
    this.setupSchedulerEvents();
    
    // Initialize stats
    this.stats = this.initializeStats();
  }

  /**
   * Initialize orchestration statistics
   */
  private initializeStats(): OrchestrationStats {
    return {
      totalTasks: 0,
      completedTasks: 0,
      failedTasks: 0,
      runningTasks: 0,
      queuedTasks: 0,
      totalWorkers: 0,
      activeWorkers: 0,
      averageTaskDuration: 0,
      successRate: 0,
      throughput: 0,
      uptime: 0,
      activeSessions: 0,
      totalSessionsCreated: 0,
      expiredSessions: 0
    };
  }

  /**
   * Set up scheduler event handlers
   */
  private setupSchedulerEvents(): void {
    this.scheduler.on('task-scheduled', this.handleTaskScheduled.bind(this));
    this.scheduler.on('task-started', this.handleTaskStarted.bind(this));
    this.scheduler.on('task-completed', this.handleTaskCompleted.bind(this));
    this.scheduler.on('task-failed', this.handleTaskFailed.bind(this));
    this.scheduler.on('worker-registered', (worker: Worker) => {
      this.emit('worker-registered', worker);
    });
    this.scheduler.on('worker-unregistered', (workerId: string) => {
      this.emit('worker-unregistered', workerId);
    });
  }

  /**
   * Start the orchestrator
   */
  async start(): Promise<void> {
    if (this._status === DriverStatus.RUNNING) return;
    
    this.setStatus(DriverStatus.STARTING);
    
    try {
      // Start scheduler
      await this.scheduler.start();
      
      // Start health check
      this.healthCheckInterval = setInterval(() => {
        this.performWorkerHealthCheck().catch(error => {
          console.error('Health check failed:', error);
        });
        this.cleanupExpiredSessions();
      }, this.config.workerHealthCheckInterval);
      
      // Start stats updates
      this.statsInterval = setInterval(() => {
        this.updateStats();
      }, 10000); // Update every 10 seconds
      
      this.setStatus(DriverStatus.RUNNING);
      this.emit('orchestration-started');
      
    } catch (error) {
      this.setStatus(DriverStatus.ERROR);
      throw error;
    }
  }

  /**
   * Stop the orchestrator
   */
  async stop(): Promise<void> {
    if (this._status === DriverStatus.STOPPED) return;
    
    this.setStatus(DriverStatus.STOPPING);
    
    try {
      // Stop intervals
      if (this.healthCheckInterval) {
        clearInterval(this.healthCheckInterval);
        this.healthCheckInterval = undefined;
      }
      
      if (this.statsInterval) {
        clearInterval(this.statsInterval);
        this.statsInterval = undefined;
      }
      
      // Cancel running tasks
      for (const [taskId, context] of this.executionContexts) {
        if (context.timeout) {
          clearTimeout(context.timeout);
        }
        
        try {
          await this.cancelWorkerTask(context.workerId, taskId);
        } catch (error) {
          console.error(`Failed to cancel task ${taskId}:`, error);
        }
      }
      
      // Terminate all active sessions
      for (const [sessionId, session] of this.sessions) {
        try {
          await this.terminateSession(sessionId);
        } catch (error) {
          console.error(`Failed to terminate session ${sessionId}:`, error);
        }
      }
      
      // Stop scheduler
      await this.scheduler.stop();
      
      this.setStatus(DriverStatus.STOPPED);
      this.emit('orchestration-stopped');
      
    } catch (error) {
      this.setStatus(DriverStatus.ERROR);
      throw error;
    }
  }

  /**
   * Register a worker
   */
  async registerWorker(worker: Worker): Promise<void> {
    this.scheduler.registerWorker(worker);
    this.updateStats();
  }

  /**
   * Unregister a worker
   */
  async unregisterWorker(workerId: string): Promise<void> {
    // Cancel any running tasks on this worker
    for (const [taskId, context] of this.executionContexts) {
      if (context.workerId === workerId) {
        this.handleTaskFailed(taskId, workerId, new Error('Worker disconnected'));
      }
    }
    
    this.scheduler.unregisterWorker(workerId);
    this.updateStats();
  }

  /**
   * Submit a task for execution
   */
  async submitTask(task: Task): Promise<void> {
    // Validate task
    if (!task.id || !task.title) {
      throw new Error('Task must have id and title');
    }

    // Check for duplicates
    if (this.executionContexts.has(task.id) || this.taskResults.has(task.id)) {
      throw new Error(`Task ${task.id} already exists`);
    }

    try {
      // Check if task has a session ID - execute in session mode
      if (task.sessionId && this.sessions.has(task.sessionId)) {
        const result = await this.executeInSession(task);
        this.taskResults.set(task.id, result);
        this.emit('task-completed', task.id, result);
        this.updateStats();
        return;
      }

      // Task decomposition (if enabled and applicable)
      if (this.config.enableTaskDecomposition && this.shouldDecomposeTask(task)) {
        const decomposed = await this.decomposeTask(task);
        
        // Submit subtasks
        for (const subtask of decomposed.subtasks) {
          await this.scheduler.submitTask(subtask);
        }
        
        // Set up result merging
        this.setupResultMerging(task, decomposed);
      } else {
        // Submit task directly to scheduler
        await this.scheduler.submitTask(task);
      }
      
      this.emit('task-submitted', task);
      this.updateStats();
      
    } catch (error) {
      throw new Error(`Failed to submit task ${task.id}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Cancel a task
   */
  async cancelTask(taskId: string): Promise<void> {
    const context = this.executionContexts.get(taskId);
    
    if (context) {
      // Cancel running task
      if (context.timeout) {
        clearTimeout(context.timeout);
      }
      
      try {
        await this.cancelWorkerTask(context.workerId, taskId);
      } catch (error) {
        console.error(`Failed to cancel task ${taskId} on worker:`, error);
      }
      
      this.executionContexts.delete(taskId);
    }
    
    // Cancel in scheduler
    await this.scheduler.cancelTask(taskId);
    
    this.updateStats();
  }

  /**
   * Get task status
   */
  getTaskStatus(taskId: string): TaskStatus {
    const context = this.executionContexts.get(taskId);
    if (context) {
      return context.status;
    }
    
    if (this.taskResults.has(taskId)) {
      return TaskStatus.COMPLETED;
    }
    
    if (this.taskErrors.has(taskId)) {
      return TaskStatus.FAILED;
    }
    
    // Check if queued
    const queuedTasks = this.scheduler.getQueuedTasks();
    const isQueued = queuedTasks.some(qt => qt.task.id === taskId);
    
    return isQueued ? TaskStatus.PENDING : TaskStatus.UNKNOWN;
  }

  /**
   * Get task result
   */
  getTaskResult(taskId: string): TaskResult | undefined {
    return this.taskResults.get(taskId);
  }

  /**
   * Get task progress
   */
  getTaskProgress(taskId: string): TaskProgress | undefined {
    const context = this.executionContexts.get(taskId);
    if (!context) return undefined;
    
    return {
      taskId,
      progress: context.progress,
      status: context.status,
      startTime: context.startTime,
      currentStep: 'Executing...',
      estimatedTimeRemaining: this.estimateRemainingTime(context)
    };
  }

  /**
   * Create a new session for container mode execution
   */
  async createSession(options: SessionOptions = {}): Promise<string> {
    // Select worker for container mode
    const worker = this.selectWorkerForMode(ExecutionMode.CONTAINER_AGENTIC);
    
    // Create session on worker
    const httpClient = axios.create({
      baseURL: worker.endpoint,
      timeout: this.config.taskTimeout,
      headers: {
        'Content-Type': 'application/json'
      }
    });
    
    try {
      const response = await httpClient.post('/sessions', {
        options
      });
      
      if (!response.data || !response.data.sessionId) {
        throw new Error('Invalid session creation response');
      }
      
      const sessionId = response.data.sessionId;
      const now = Date.now();
      const timeout = (options.timeout || 3600) * 1000; // Default 1 hour
      
      // Store session information
      const session: Session = {
        id: sessionId,
        workerId: worker.id,
        createdAt: now,
        expiresAt: now + timeout,
        lastActivity: now,
        options
      };
      
      this.sessions.set(sessionId, session);
      this.totalSessionsCreated++;
      
      this.emit('session-created', sessionId, worker.id);
      this.updateStats();
      
      return sessionId;
      
    } catch (error) {
      throw new Error(`Failed to create session on worker ${worker.id}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Execute a task in an existing session
   */
  async executeInSession(task: Task): Promise<TaskResult> {
    const sessionId = task.sessionId;
    if (!sessionId) {
      throw new Error('Task does not have a session ID');
    }
    
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Session ${sessionId} not found`);
    }
    
    // Check if session has expired
    const now = Date.now();
    if (session.expiresAt < now) {
      await this.cleanupSession(sessionId);
      throw new Error(`Session ${sessionId} has expired`);
    }
    
    // Update last activity
    session.lastActivity = now;
    
    // Get worker for session
    const workers = this.scheduler.getRegisteredWorkers();
    const worker = workers.find(w => w.id === session.workerId);
    if (!worker) {
      throw new Error(`Worker ${session.workerId} for session ${sessionId} not found`);
    }
    
    // Create HTTP client for worker
    const httpClient = axios.create({
      baseURL: worker.endpoint,
      timeout: this.config.taskTimeout,
      headers: {
        'Content-Type': 'application/json'
      }
    });
    
    try {
      const response = await httpClient.post(`/sessions/${sessionId}/execute`, {
        task,
        options: {
          timeout: this.config.taskTimeout
        }
      });
      
      const result: TaskResult = {
        taskId: task.id,
        status: TaskStatus.COMPLETED,
        output: response.data.output || '',
        artifacts: response.data.artifacts || [],
        startTime: new Date(response.data.startTime),
        endTime: new Date(response.data.endTime || Date.now()),
        duration: response.data.duration || 0,
        metadata: response.data.metadata || {}
      };
      
      return result;
      
    } catch (error) {
      throw new Error(`Failed to execute task ${task.id} in session ${sessionId}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Terminate a session
   */
  async terminateSession(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return; // Session already terminated or doesn't exist
    }
    
    // Get worker for session
    const workers = this.scheduler.getRegisteredWorkers();
    const worker = workers.find(w => w.id === session.workerId);
    
    if (worker) {
      try {
        const httpClient = axios.create({
          baseURL: worker.endpoint,
          timeout: 5000
        });
        
        await httpClient.delete(`/sessions/${sessionId}`);
      } catch (error) {
        console.error(`Failed to terminate session ${sessionId} on worker:`, error);
      }
    }
    
    // Remove from local tracking
    this.sessions.delete(sessionId);
    this.emit('session-terminated', sessionId);
    this.updateStats();
  }

  /**
   * Get active session information
   */
  getSession(sessionId: string): Session | undefined {
    return this.sessions.get(sessionId);
  }

  /**
   * Get all active sessions
   */
  getActiveSessions(): Session[] {
    return Array.from(this.sessions.values());
  }

  /**
   * Select a worker that supports the specified execution mode
   */
  private selectWorkerForMode(mode: ExecutionMode): Worker {
    const workers = this.scheduler.getRegisteredWorkers();
    
    // Find workers that support the requested mode
    const compatibleWorkers = workers.filter(worker => {
      const capabilities = worker.capabilities;
      
      // Check if worker supports container execution for CONTAINER_AGENTIC mode
      if (mode === ExecutionMode.CONTAINER_AGENTIC) {
        return capabilities.supportsContainerExecution || 
               (capabilities.executionModes && capabilities.executionModes.includes('container_agentic')) ||
               (worker.config.featureFlags && worker.config.featureFlags.allowModeOverride);
      }
      
      // Check if worker supports process pool for PROCESS_POOL mode
      if (mode === ExecutionMode.PROCESS_POOL) {
        return !capabilities.executionModes || 
               capabilities.executionModes.includes('process_pool') ||
               capabilities.executionModes.length === 0; // Default mode
      }
      
      return false;
    });
    
    if (compatibleWorkers.length === 0) {
      throw new Error(`No workers available for execution mode: ${mode}`);
    }
    
    // Select the least loaded compatible worker
    return this.selectLeastLoadedWorker(compatibleWorkers);
  }

  /**
   * Select the least loaded worker from a list of workers
   */
  private selectLeastLoadedWorker(workers: Worker[]): Worker {
    if (workers.length === 0) {
      throw new Error('No workers available for selection');
    }
    
    // Sort by current task count (ascending) and then by response time
    return workers.sort((a, b) => {
      // First, sort by current task count
      const aTaskCount = a.currentTasks.length;
      const bTaskCount = b.currentTasks.length;
      
      if (aTaskCount !== bTaskCount) {
        return aTaskCount - bTaskCount;
      }
      
      // If task count is equal, sort by health response time
      return a.health.responseTime - b.health.responseTime;
    })[0];
  }

  /**
   * Clean up expired sessions
   */
  private cleanupExpiredSessions(): void {
    const now = Date.now();
    const expiredSessions: string[] = [];
    
    for (const [sessionId, session] of this.sessions) {
      if (session.expiresAt < now) {
        expiredSessions.push(sessionId);
      }
    }
    
    for (const sessionId of expiredSessions) {
      this.cleanupSession(sessionId).catch(error => {
        console.error(`Failed to cleanup expired session ${sessionId}:`, error);
      });
    }
  }

  /**
   * Clean up a specific session
   */
  private async cleanupSession(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return;
    }
    
    // Terminate session on worker
    await this.terminateSession(sessionId);
    
    // Increment expired sessions counter
    this.expiredSessionsCount++;
    
    this.emit('session-expired', sessionId);
  }

  /**
   * Handle task scheduled event
   */
  private async handleTaskScheduled(plan: TaskExecutionPlan): Promise<void> {
    const { taskId, workerId } = plan;
    
    // Get worker info
    const workers = this.scheduler.getRegisteredWorkers();
    const worker = workers.find(w => w.id === workerId);
    if (!worker) {
      throw new Error(`Worker ${workerId} not found`);
    }
    
    // Create HTTP client for worker
    const httpClient = axios.create({
      baseURL: worker.endpoint,
      timeout: this.config.taskTimeout,
      headers: {
        'Content-Type': 'application/json'
      }
    });
    
    // Create execution context
    const context: TaskExecutionContext = {
      taskId,
      workerId,
      startTime: new Date(),
      httpClient,
      progress: 0,
      status: TaskStatus.PENDING
    };
    
    this.executionContexts.set(taskId, context);
  }

  /**
   * Handle task started event
   */
  private async handleTaskStarted(taskId: string, workerId: string): Promise<void> {
    const context = this.executionContexts.get(taskId);
    if (!context) return;
    
    // Get the actual task
    const queuedTasks = this.scheduler.getQueuedTasks();
    const queuedTask = queuedTasks.find(qt => qt.task.id === taskId);
    if (!queuedTask) return;
    
    try {
      // Submit task to worker
      const response = await context.httpClient.post('/tasks', {
        task: queuedTask.task,
        options: {
          timeout: this.config.taskTimeout
        }
      });
      
      context.status = TaskStatus.RUNNING;
      
      // Set up timeout
      context.timeout = setTimeout(() => {
        this.handleTaskTimeout(taskId);
      }, this.config.taskTimeout);
      
      // Start progress monitoring
      this.startProgressMonitoring(taskId);
      
      this.emit('task-started', taskId, workerId);
      
    } catch (error) {
      this.handleTaskFailed(taskId, workerId, error instanceof Error ? error : new Error(String(error)));
    }
  }

  /**
   * Handle task completed event
   */
  private async handleTaskCompleted(taskId: string, workerId: string, duration: number): Promise<void> {
    const context = this.executionContexts.get(taskId);
    if (!context) return;
    
    try {
      // Get result from worker
      const response = await context.httpClient.get(`/tasks/${taskId}`);
      const result: TaskResult = {
        taskId,
        status: TaskStatus.COMPLETED,
        output: response.data.result || '',
        artifacts: response.data.artifacts || [],
        startTime: context.startTime,
        endTime: new Date(),
        duration,
        metadata: response.data.metadata || {}
      };
      
      // Store result
      this.taskResults.set(taskId, result);
      
      // Cleanup
      this.cleanupTaskExecution(taskId);
      
      this.emit('task-completed', taskId, result);
      this.updateStats();
      
    } catch (error) {
      this.handleTaskFailed(taskId, workerId, error instanceof Error ? error : new Error('Failed to get task result'));
    }
  }

  /**
   * Handle task failed event
   */
  private async handleTaskFailed(taskId: string, workerId: string, error: Error): Promise<void> {
    // Store error
    this.taskErrors.set(taskId, error);
    
    // Cleanup
    this.cleanupTaskExecution(taskId);
    
    this.emit('task-failed', taskId, error);
    this.updateStats();
  }

  /**
   * Handle task timeout
   */
  private async handleTaskTimeout(taskId: string): Promise<void> {
    const context = this.executionContexts.get(taskId);
    if (!context) return;
    
    try {
      await this.cancelWorkerTask(context.workerId, taskId);
    } catch (error) {
      console.error(`Failed to cancel timed out task ${taskId}:`, error);
    }
    
    const timeoutError = new Error(`Task ${taskId} timed out after ${this.config.taskTimeout}ms`);
    this.handleTaskFailed(taskId, context.workerId, timeoutError);
  }

  /**
   * Start progress monitoring for a task
   */
  private startProgressMonitoring(taskId: string): void {
    const context = this.executionContexts.get(taskId);
    if (!context) return;
    
    const monitor = setInterval(async () => {
      try {
        const response = await context.httpClient.get(`/tasks/${taskId}`);
        const progress = response.data.progress || 0;
        
        if (progress !== context.progress) {
          context.progress = progress;
          
          const taskProgress: TaskProgress = {
            taskId,
            progress,
            status: context.status,
            startTime: context.startTime,
            currentStep: response.data.currentStep || 'Processing...',
            estimatedTimeRemaining: this.estimateRemainingTime(context)
          };
          
          this.emit('task-progress', taskId, taskProgress);
        }
        
        // Check if completed
        if (response.data.status === 'completed') {
          clearInterval(monitor);
          this.handleTaskCompleted(taskId, context.workerId, Date.now() - context.startTime.getTime());
        } else if (response.data.status === 'failed') {
          clearInterval(monitor);
          this.handleTaskFailed(taskId, context.workerId, new Error(response.data.error || 'Task failed'));
        }
        
      } catch (error) {
        clearInterval(monitor);
        this.handleTaskFailed(taskId, context.workerId, error instanceof Error ? error : new Error('Progress monitoring failed'));
      }
    }, 2000); // Check every 2 seconds
  }

  /**
   * Cancel a task on a worker
   */
  private async cancelWorkerTask(workerId: string, taskId: string): Promise<void> {
    const workers = this.scheduler.getRegisteredWorkers();
    const worker = workers.find(w => w.id === workerId);
    if (!worker) return;
    
    const httpClient = axios.create({
      baseURL: worker.endpoint,
      timeout: 5000
    });
    
    await httpClient.delete(`/tasks/${taskId}`);
  }

  /**
   * Perform worker health check
   */
  private async performWorkerHealthCheck(): Promise<void> {
    const workers = this.scheduler.getRegisteredWorkers();
    
    for (const worker of workers) {
      try {
        const httpClient = axios.create({
          baseURL: worker.endpoint,
          timeout: 5000
        });
        
        const response = await httpClient.get('/health');
        const isHealthy = response.status === 200 && response.data.status === 'healthy';
        
        if (!isHealthy && worker.status !== WorkerStatus.ERROR) {
          this.emit('worker-health-changed', worker.id, false);
        } else if (isHealthy && worker.status === WorkerStatus.ERROR) {
          this.emit('worker-health-changed', worker.id, true);
        }
        
      } catch (error) {
        this.emit('worker-health-changed', worker.id, false);
      }
    }
  }

  /**
   * Should decompose task
   */
  private shouldDecomposeTask(task: Task): boolean {
    // Simple heuristics - can be enhanced
    const title = task.title.toLowerCase();
    
    // Check for keywords that indicate decomposable tasks
    const decomposableKeywords = ['refactor', 'analyze', 'implement', 'create multiple', 'batch'];
    return decomposableKeywords.some(keyword => title.includes(keyword));
  }

  /**
   * Decompose a task into subtasks
   */
  private async decomposeTask(task: Task): Promise<DecomposedTask> {
    // This is a simplified implementation
    // In practice, this would use AI or more sophisticated logic
    
    const subtasks: Task[] = [];
    const baseId = task.id;
    
    // Simple decomposition based on task type
    if (task.title.toLowerCase().includes('refactor')) {
      subtasks.push(
        { ...task, id: `${baseId}-analyze`, title: `Analyze ${task.title}`, description: 'Analyze current code structure' },
        { ...task, id: `${baseId}-plan`, title: `Plan ${task.title}`, description: 'Create refactoring plan', dependencies: [`${baseId}-analyze`] },
        { ...task, id: `${baseId}-execute`, title: `Execute ${task.title}`, description: 'Perform refactoring', dependencies: [`${baseId}-plan`] }
      );
    } else {
      // Default: split into planning and execution
      subtasks.push(
        { ...task, id: `${baseId}-plan`, title: `Plan ${task.title}`, description: 'Create execution plan' },
        { ...task, id: `${baseId}-execute`, title: `Execute ${task.title}`, description: 'Execute the planned task', dependencies: [`${baseId}-plan`] }
      );
    }
    
    return {
      subtasks,
      mergeStrategy: 'concat'
    };
  }

  /**
   * Set up result merging for decomposed tasks
   */
  private setupResultMerging(parentTask: Task, decomposed: DecomposedTask): void {
    // Track subtask completion
    const subtaskResults = new Map<string, TaskResult>();
    let completedSubtasks = 0;
    
    const checkCompletion = () => {
      if (completedSubtasks === decomposed.subtasks.length) {
        // All subtasks completed, merge results
        const results = Array.from(subtaskResults.values());
        const mergedResult = this.mergeTaskResults(parentTask.id, results, decomposed.mergeStrategy);
        
        this.taskResults.set(parentTask.id, mergedResult);
        this.emit('task-completed', parentTask.id, mergedResult);
      }
    };
    
    // Listen for subtask completions
    for (const subtask of decomposed.subtasks) {
      this.on('task-completed', (taskId, result) => {
        if (taskId === subtask.id) {
          subtaskResults.set(taskId, result);
          completedSubtasks++;
          checkCompletion();
        }
      });
    }
  }

  /**
   * Merge task results
   */
  private mergeTaskResults(parentTaskId: string, results: TaskResult[], strategy: 'concat' | 'merge' | 'reduce' | 'custom'): TaskResult {
    const startTime = new Date(Math.min(...results.map(r => r.startTime.getTime())));
    const endTime = new Date(Math.max(...results.map(r => r.endTime.getTime())));
    
    let mergedOutput = '';
    let mergedArtifacts: any[] = [];
    
    switch (strategy) {
      case 'concat':
        mergedOutput = results.map(r => r.output).join('\n\n');
        mergedArtifacts = results.flatMap(r => r.artifacts);
        break;
      case 'merge':
        // More sophisticated merging logic would go here
        mergedOutput = results.map(r => r.output).join('\n');
        mergedArtifacts = results.flatMap(r => r.artifacts);
        break;
      default:
        mergedOutput = results.map(r => r.output).join('\n');
        mergedArtifacts = results.flatMap(r => r.artifacts);
    }
    
    return {
      taskId: parentTaskId,
      status: TaskStatus.COMPLETED,
      output: mergedOutput,
      artifacts: mergedArtifacts,
      startTime,
      endTime,
      duration: endTime.getTime() - startTime.getTime(),
      metadata: {
        subtaskCount: results.length,
        mergeStrategy: strategy
      }
    };
  }

  /**
   * Estimate remaining time for task
   */
  private estimateRemainingTime(context: TaskExecutionContext): number {
    const elapsed = Date.now() - context.startTime.getTime();
    const progress = Math.max(context.progress, 0.01); // Avoid division by zero
    
    return Math.round((elapsed / progress) * (1 - progress));
  }

  /**
   * Cleanup task execution
   */
  private cleanupTaskExecution(taskId: string): void {
    const context = this.executionContexts.get(taskId);
    if (context && context.timeout) {
      clearTimeout(context.timeout);
    }
    
    this.executionContexts.delete(taskId);
  }

  /**
   * Update orchestration statistics
   */
  private updateStats(): void {
    const schedulerStats = this.scheduler.getStats();
    
    this.stats = {
      totalTasks: schedulerStats.totalTasks,
      completedTasks: schedulerStats.completedTasks,
      failedTasks: schedulerStats.failedTasks,
      runningTasks: schedulerStats.runningTasks,
      queuedTasks: schedulerStats.pendingTasks,
      totalWorkers: this.scheduler.getRegisteredWorkers().length,
      activeWorkers: this.scheduler.getRegisteredWorkers().filter(w => 
        w.status === WorkerStatus.IDLE || w.status === WorkerStatus.BUSY
      ).length,
      averageTaskDuration: schedulerStats.averageExecutionTime,
      successRate: schedulerStats.totalTasks > 0 
        ? (schedulerStats.completedTasks / schedulerStats.totalTasks) * 100 
        : 0,
      throughput: schedulerStats.throughput,
      uptime: Date.now() - this.startTime.getTime(),
      activeSessions: this.sessions.size,
      totalSessionsCreated: this.totalSessionsCreated,
      expiredSessions: this.expiredSessionsCount
    };
    
    this.emit('stats-updated', this.stats);
  }

  /**
   * Set orchestrator status
   */
  private setStatus(status: DriverStatus): void {
    this._status = status;
    (this.status as any) = status; // Update readonly property
  }

  /**
   * Get orchestration statistics
   */
  getStats(): OrchestrationStats {
    return { ...this.stats };
  }

  /**
   * Get registered workers
   */
  getWorkers(): Worker[] {
    return this.scheduler.getRegisteredWorkers();
  }

  /**
   * Get execution contexts
   */
  getExecutionContexts(): Map<string, TaskExecutionContext> {
    return new Map(this.executionContexts);
  }

  /**
   * Get scheduler instance
   */
  getScheduler(): TaskScheduler {
    return this.scheduler;
  }
}