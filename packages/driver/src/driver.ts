/**
 * @fileoverview Main Driver implementation that combines orchestrator and server
 */

import { EventEmitter } from 'events';
import { DriverServer, type DriverServerConfig } from './server/index.js';
import { TaskOrchestrator, type OrchestrationStats } from './orchestrator/index.js';
import type { Task, TaskResult, Worker, TaskProgress, Driver } from '@claudecluster/core';
import { DriverStatus } from '@claudecluster/core';

/**
 * Driver configuration
 */
export interface ClaudeDriverConfig extends DriverServerConfig {
  readonly name?: string;
  readonly description?: string;
  readonly tags?: readonly string[];
}

/**
 * Driver events
 */
export interface DriverEvents {
  started: () => void;
  stopped: () => void;
  ready: () => void;
  error: (error: Error) => void;
  'task-submitted': (task: Task) => void;
  'task-completed': (taskId: string, result: TaskResult) => void;
  'task-failed': (taskId: string, error: Error) => void;
  'task-progress': (taskId: string, progress: TaskProgress) => void;
  'worker-registered': (worker: Worker) => void;
  'worker-unregistered': (workerId: string) => void;
  'worker-health-changed': (workerId: string, isHealthy: boolean) => void;
  'stats-updated': (stats: OrchestrationStats) => void;
  'status-changed': (status: DriverStatus) => void;
}

/**
 * Main Driver implementation
 */
export class ClaudeDriver extends EventEmitter implements Driver {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly tags: readonly string[];
  readonly version: string;
  readonly createdAt: Date;
  readonly status: DriverStatus;
  
  private server: DriverServer;
  private _status: DriverStatus = DriverStatus.INITIALIZING;
  private startTime?: Date;

  constructor(private driverConfig: ClaudeDriverConfig) {
    super();
    
    this.id = driverConfig.driverId || 'default-driver';
    this.name = driverConfig.name || `Driver-${this.id}`;
    this.description = driverConfig.description || 'ClaudeCluster Driver';
    this.tags = driverConfig.tags || [];
    this.version = '0.1.0';
    this.createdAt = new Date();
    this.status = this._status;
    
    // Initialize server
    this.server = new DriverServer(driverConfig);
    this.setupEventHandlers();
  }

  /**
   * Set up event handlers
   */
  private setupEventHandlers(): void {
    this.server.on('started', () => {
      this.setStatus(DriverStatus.RUNNING);
      this.emit('started');
      this.emit('ready');
    });

    this.server.on('stopped', () => {
      this.setStatus(DriverStatus.STOPPED);
      this.emit('stopped');
    });

    this.server.on('task-submitted', (task: Task) => {
      this.emit('task-submitted', task);
    });

    this.server.on('task-completed', (taskId: string, result: TaskResult) => {
      this.emit('task-completed', taskId, result);
    });

    this.server.on('task-failed', (taskId: string, error: Error) => {
      this.emit('task-failed', taskId, error);
    });

    this.server.on('worker-registered', (worker: Worker) => {
      this.emit('worker-registered', worker);
    });

    this.server.on('worker-unregistered', (workerId: string) => {
      this.emit('worker-unregistered', workerId);
    });

    // Forward orchestrator events
    const orchestrator = this.server.getOrchestrator();
    
    orchestrator.on('task-progress', (taskId: string, progress: TaskProgress) => {
      this.emit('task-progress', taskId, progress);
    });

    orchestrator.on('worker-health-changed', (workerId: string, isHealthy: boolean) => {
      this.emit('worker-health-changed', workerId, isHealthy);
    });

    orchestrator.on('stats-updated', (stats: OrchestrationStats) => {
      this.emit('stats-updated', stats);
    });
  }

  /**
   * Start the driver
   */
  async start(): Promise<void> {
    try {
      this.setStatus(DriverStatus.STARTING);
      this.startTime = new Date();
      
      await this.server.start();
      
    } catch (error) {
      this.setStatus(DriverStatus.ERROR);
      this.emit('error', error instanceof Error ? error : new Error(String(error)));
      throw error;
    }
  }

  /**
   * Stop the driver
   */
  async stop(): Promise<void> {
    try {
      this.setStatus(DriverStatus.STOPPING);
      await this.server.stop();
    } catch (error) {
      this.setStatus(DriverStatus.ERROR);
      this.emit('error', error instanceof Error ? error : new Error(String(error)));
      throw error;
    }
  }

  /**
   * Get driver status
   */
  getStatus(): DriverStatus {
    return this._status;
  }

  /**
   * Check if driver is healthy
   */
  isHealthy(): boolean {
    return this._status === DriverStatus.RUNNING;
  }

  /**
   * Get driver uptime in milliseconds
   */
  getUptime(): number {
    if (!this.startTime) return 0;
    return Date.now() - this.startTime.getTime();
  }

  /**
   * Submit a task for execution
   */
  async submitTask(task: Task): Promise<void> {
    const orchestrator = this.server.getOrchestrator();
    await orchestrator.submitTask(task);
  }

  /**
   * Cancel a task
   */
  async cancelTask(taskId: string): Promise<void> {
    const orchestrator = this.server.getOrchestrator();
    await orchestrator.cancelTask(taskId);
  }

  /**
   * Register a worker
   */
  async registerWorker(worker: Worker): Promise<void> {
    const orchestrator = this.server.getOrchestrator();
    await orchestrator.registerWorker(worker);
  }

  /**
   * Unregister a worker
   */
  async unregisterWorker(workerId: string): Promise<void> {
    const orchestrator = this.server.getOrchestrator();
    await orchestrator.unregisterWorker(workerId);
  }

  /**
   * Get task status
   */
  getTaskStatus(taskId: string): any {
    const orchestrator = this.server.getOrchestrator();
    return orchestrator.getTaskStatus(taskId);
  }

  /**
   * Get task result
   */
  getTaskResult(taskId: string): TaskResult | undefined {
    const orchestrator = this.server.getOrchestrator();
    return orchestrator.getTaskResult(taskId);
  }

  /**
   * Get task progress
   */
  getTaskProgress(taskId: string): TaskProgress | undefined {
    const orchestrator = this.server.getOrchestrator();
    return orchestrator.getTaskProgress(taskId);
  }

  /**
   * Get registered workers
   */
  getWorkers(): Worker[] {
    const orchestrator = this.server.getOrchestrator();
    return orchestrator.getWorkers();
  }

  /**
   * Get orchestration statistics
   */
  getStats(): OrchestrationStats {
    const orchestrator = this.server.getOrchestrator();
    return orchestrator.getStats();
  }

  /**
   * Get server URL
   */
  getServerUrl(): string {
    return this.server.getServerUrl();
  }

  /**
   * Get server instance (for testing)
   */
  getServer(): DriverServer {
    return this.server;
  }

  /**
   * Get orchestrator instance
   */
  getOrchestrator(): TaskOrchestrator {
    return this.server.getOrchestrator();
  }

  /**
   * Set driver status and emit event
   */
  private setStatus(status: DriverStatus): void {
    if (this._status !== status) {
      this._status = status;
      (this.status as any) = status; // Update readonly property
      this.emit('status-changed', status);
    }
  }
}

/**
 * Create a driver with default configuration
 */
export function createDriver(config: Partial<ClaudeDriverConfig> & { driverId: string }): ClaudeDriver {
  const defaultConfig: ClaudeDriverConfig = {
    driverId: config.driverId,
    name: config.name || `Driver-${config.driverId}`,
    description: config.description || 'ClaudeCluster Driver',
    tags: config.tags || [],
    host: '0.0.0.0',
    port: 3000,
    enableCORS: true,
    enableWebSocket: true,
    requestTimeout: 600000,
    enableMetrics: true,
    enableHealthCheck: true,
    maxConcurrentTasks: 100,
    taskTimeout: 600000,
    workerHealthCheckInterval: 30000,
    resultAggregationTimeout: 5000,
    enableTaskDecomposition: true,
    enableResultMerging: true,
    retryFailedTasks: true
  };

  const finalConfig = { ...defaultConfig, ...config };
  return new ClaudeDriver(finalConfig);
}

/**
 * Start a driver server with CLI-like interface
 */
export async function startDriverServer(config?: Partial<ClaudeDriverConfig>): Promise<ClaudeDriver> {
  const driverId = config?.driverId || `driver-${Date.now()}`;
  const driver = createDriver({ ...config, driverId });

  // Set up signal handlers
  process.on('SIGTERM', async () => {
    console.log('Received SIGTERM, shutting down gracefully...');
    await driver.stop();
    process.exit(0);
  });

  process.on('SIGINT', async () => {
    console.log('Received SIGINT, shutting down gracefully...');
    await driver.stop();
    process.exit(0);
  });

  process.on('uncaughtException', (error) => {
    console.error('Uncaught exception:', error);
    driver.stop().then(() => process.exit(1));
  });

  process.on('unhandledRejection', (reason) => {
    console.error('Unhandled rejection:', reason);
    driver.stop().then(() => process.exit(1));
  });

  await driver.start();
  return driver;
}