/**
 * @fileoverview Main Worker implementation that combines all components
 */

import { EventEmitter } from 'events';
import type { Task, TaskResult, Worker, WorkerCapabilities, WorkerResources, WorkerHealth, WorkerMetrics, WorkerConfig as CoreWorkerConfig, WorkerTaskAssignment, TaskCategory } from '@claudecluster/core';
import { WorkerStatus } from '@claudecluster/core';
import { ExecutionMode } from '@claudecluster/core';
import { WorkerServer, type WorkerServerConfig } from './server/index.js';
import { TaskExecutionEngine } from './engine/index.js';
import { ClaudeProcessPool } from './process/index.js';
import type { ClaudeProcessConfig } from './process/index.js';

/**
 * Worker configuration
 */
export interface WorkerConfig extends WorkerServerConfig {
  readonly workerId: string;
  readonly name?: string;
  readonly description?: string;
  readonly tags?: readonly string[];
}

/**
 * Worker events
 */
export interface WorkerEvents {
  started: () => void;
  stopped: () => void;
  ready: () => void;
  error: (error: Error) => void;
  'task-started': (task: Task) => void;
  'task-completed': (task: Task, result: TaskResult) => void;
  'task-failed': (task: Task, error: Error) => void;
  'task-progress': (task: Task, progress: number) => void;
  'status-changed': (status: WorkerStatus) => void;
}

/**
 * Main Worker implementation
 */
export class ClaudeWorker extends EventEmitter {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly tags: readonly string[];
  
  private server: WorkerServer;
  private _status: WorkerStatus = WorkerStatus.STARTING;
  private _capabilities: WorkerCapabilities;
  private startTime: Date;

  constructor(private workerConfig: WorkerConfig) {
    super();
    
    this.id = workerConfig.workerId;
    this.name = workerConfig.name || `Worker-${workerConfig.workerId}`;
    this.description = workerConfig.description || 'Claude Code Worker';
    this.tags = workerConfig.tags || [];
    this.startTime = new Date();
    
    // Initialize capabilities
    this._capabilities = {
      supportedCategories: ['coding' as TaskCategory, 'analysis' as TaskCategory, 'refactoring' as TaskCategory, 'testing' as TaskCategory, 'documentation' as TaskCategory],
      maxConcurrentTasks: workerConfig.maxConcurrentTasks,
      supportsStreaming: true,
      supportsFileOperations: true,
      supportsNetworking: true,
      claudeCodeVersion: 'latest',
      nodeVersion: process.version,
      operatingSystem: process.platform,
      architecture: process.arch
    };

    // Initialize server
    this.server = new WorkerServer(workerConfig);
    this.setupEventHandlers();
  }

  /**
   * Set up event handlers
   */
  private setupEventHandlers(): void {
    this.server.on('started', () => {
      this.setStatus(WorkerStatus.IDLE);
      this.emit('started');
      this.emit('ready');
    });

    this.server.on('stopped', () => {
      this.setStatus(WorkerStatus.OFFLINE);
      this.emit('stopped');
    });

    this.server.on('task-started', (execution: any) => {
      this.emit('task-started', execution.task);
    });

    this.server.on('task-completed', (execution: any, result: any) => {
      this.emit('task-completed', execution.task, result);
    });

    this.server.on('task-failed', (execution: any, error: any) => {
      this.emit('task-failed', execution.task, error);
    });

    this.server.on('task-progress', (execution: any, progress: any) => {
      this.emit('task-progress', execution.task, progress);
    });
  }

  /**
   * Start the worker
   */
  async start(): Promise<void> {
    try {
      this.setStatus(WorkerStatus.STARTING);
      this.startTime = new Date();
      
      await this.server.start();
    } catch (error) {
      this.setStatus(WorkerStatus.ERROR);
      this.emit('error', error instanceof Error ? error : new Error(String(error)));
      throw error;
    }
  }

  /**
   * Stop the worker
   */
  async stop(): Promise<void> {
    try {
      this.setStatus(WorkerStatus.STOPPING);
      await this.server.stop();
    } catch (error) {
      this.setStatus(WorkerStatus.ERROR);
      this.emit('error', error instanceof Error ? error : new Error(String(error)));
      throw error;
    }
  }

  /**
   * Get worker status
   */
  getStatus(): WorkerStatus {
    return this._status;
  }

  /**
   * Get worker capabilities
   */
  getCapabilities(): WorkerCapabilities {
    return { ...this._capabilities };
  }

  /**
   * Check if worker is healthy
   */
  isHealthy(): boolean {
    return this._status === WorkerStatus.IDLE || this._status === WorkerStatus.BUSY;
  }

  /**
   * Get worker uptime in milliseconds
   */
  getUptime(): number {
    if (!this.startTime) return 0;
    return Date.now() - this.startTime.getTime();
  }

  /**
   * Get active task count
   */
  getActiveTaskCount(): number {
    return this.server.getActiveTaskCount();
  }

  /**
   * Get task metrics
   */
  getTaskMetrics() {
    return this.server.getTaskMetrics();
  }

  /**
   * Get server URL
   */
  getServerUrl(): string {
    const { host, port } = this.workerConfig;
    const hostname = host === '0.0.0.0' ? 'localhost' : host;
    return `http://${hostname}:${port}`;
  }

  /**
   * Get server instance (for testing)
   */
  getServer(): WorkerServer {
    return this.server;
  }

  /**
   * Set worker status and emit event
   */
  private setStatus(status: WorkerStatus): void {
    if (this._status !== status) {
      this._status = status;
      this.emit('status-changed', status);
    }
  }
}

/**
 * Create a worker with default configuration
 */
export function createWorker(config: Partial<WorkerConfig> & { workerId: string }): ClaudeWorker {
  const defaultConfig: WorkerConfig = {
    workerId: config.workerId,
    name: config.name || `Worker-${config.workerId}`,
    description: config.description || 'Claude Code Worker',
    tags: config.tags || [],
    host: '0.0.0.0',
    port: 3001,
    maxConcurrentTasks: 5,
    executionMode: ExecutionMode.PROCESS_POOL,
    sessionTimeout: 300000, // 5 minutes
    enableAgenticMode: false,
    enableHealthCheck: true,
    enableMetrics: true,
    requestTimeout: 600000 // 10 minutes
  };

  const finalConfig = { ...defaultConfig, ...config };
  return new ClaudeWorker(finalConfig);
}

/**
 * Start a worker server with CLI-like interface
 */
export async function startWorkerServer(config?: Partial<WorkerConfig>): Promise<ClaudeWorker> {
  const workerId = config?.workerId || `worker-${Date.now()}`;
  const worker = createWorker({ ...config, workerId });

  // Set up signal handlers
  process.on('SIGTERM', async () => {
    console.log('Received SIGTERM, shutting down gracefully...');
    await worker.stop();
    process.exit(0);
  });

  process.on('SIGINT', async () => {
    console.log('Received SIGINT, shutting down gracefully...');
    await worker.stop();
    process.exit(0);
  });

  process.on('uncaughtException', (error) => {
    console.error('Uncaught exception:', error);
    worker.stop().then(() => process.exit(1));
  });

  process.on('unhandledRejection', (reason) => {
    console.error('Unhandled rejection:', reason);
    worker.stop().then(() => process.exit(1));
  });

  await worker.start();
  return worker;
}