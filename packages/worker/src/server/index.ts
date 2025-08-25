/**
 * @fileoverview Fastify HTTP API server for Worker
 */

import Fastify from 'fastify';
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type { Task, TaskResult, WorkerStatus, WorkerCapabilities, TaskCategory } from '@claudecluster/core';
import { TaskExecutionEngine } from '../engine/index.js';
import { ClaudeProcessPool } from '../process/index.js';
import type { TaskExecutionOptions } from '../engine/index.js';
import type { ClaudeProcessConfig } from '../process/index.js';
import { EventEmitter } from 'events';

/**
 * Worker server configuration
 */
export interface WorkerServerConfig {
  readonly host: string;
  readonly port: number;
  readonly processConfig: ClaudeProcessConfig;
  readonly maxConcurrentTasks: number;
  readonly enableHealthCheck: boolean;
  readonly enableMetrics: boolean;
  readonly corsOrigin?: string | string[];
  readonly requestTimeout: number;
}

/**
 * Default worker server configuration
 */
export const DEFAULT_WORKER_CONFIG: WorkerServerConfig = {
  host: '0.0.0.0',
  port: 3001,
  processConfig: {
    workspaceDir: './workspace',
    tempDir: './temp',
    timeout: 300000, // 5 minutes
    maxMemoryMB: 512,
    environment: {}
  },
  maxConcurrentTasks: 5,
  enableHealthCheck: true,
  enableMetrics: true,
  requestTimeout: 600000 // 10 minutes
};

/**
 * Task submission request schema
 */
interface TaskSubmissionRequest {
  task: Task;
  options?: Partial<TaskExecutionOptions>;
}

/**
 * Task status request schema
 */
interface TaskStatusRequest {
  taskId: string;
}

/**
 * Health check response
 */
interface HealthCheckResponse {
  status: 'healthy' | 'unhealthy';
  timestamp: string;
  uptime: number;
  version: string;
  worker: {
    status: string;
    capabilities: WorkerCapabilities;
    processPool: {
      total: number;
      available: number;
      busy: number;
    };
    activeTasks: number;
  };
  system: {
    memoryUsage: NodeJS.MemoryUsage;
    cpuUsage: NodeJS.CpuUsage;
    platform: string;
    nodeVersion: string;
  };
}

/**
 * Metrics response
 */
interface MetricsResponse {
  tasks: {
    total: number;
    completed: number;
    failed: number;
    running: number;
    pending: number;
  };
  performance: {
    averageExecutionTime: number;
    successRate: number;
    throughput: number; // tasks per minute
  };
  resources: {
    memoryUsage: NodeJS.MemoryUsage;
    cpuUsage: NodeJS.CpuUsage;
    processPoolStats: {
      total: number;
      available: number;
      busy: number;
    };
  };
}

/**
 * Worker HTTP API server
 */
export class WorkerServer extends EventEmitter {
  private fastify: FastifyInstance;
  private taskEngine: TaskExecutionEngine;
  private processPool: ClaudeProcessPool;
  private activeTasks = new Map<string, Promise<TaskResult>>();
  private taskMetrics = {
    total: 0,
    completed: 0,
    failed: 0,
    executionTimes: [] as number[],
    startTime: Date.now()
  };
  private cpuUsageStart: NodeJS.CpuUsage;

  constructor(private config: WorkerServerConfig = DEFAULT_WORKER_CONFIG) {
    super();
    
    // Initialize Fastify
    this.fastify = Fastify({
      logger: process.env.NODE_ENV === 'development' 
        ? { level: 'info', transport: { target: 'pino-pretty' } }
        : { level: 'info' },
      requestTimeout: config.requestTimeout
    });

    // Initialize process pool and task engine
    this.processPool = new ClaudeProcessPool(config.processConfig, config.maxConcurrentTasks);
    this.taskEngine = new TaskExecutionEngine(
      config.processConfig.workspaceDir,
      config.processConfig.tempDir,
      this.processPool
    );
    this.cpuUsageStart = process.cpuUsage();

    // Set up routes
    this.setupRoutes();
    this.setupEventHandlers();
  }

  /**
   * Set up Fastify routes
   */
  private setupRoutes(): void {
    // CORS support
    if (this.config.corsOrigin) {
      this.fastify.register(require('@fastify/cors'), {
        origin: this.config.corsOrigin
      });
    }

    // Health check endpoint
    if (this.config.enableHealthCheck) {
      this.fastify.get('/health', this.handleHealthCheck.bind(this));
      this.fastify.get('/health/ready', this.handleReadinessCheck.bind(this));
      this.fastify.get('/health/live', this.handleLivenessCheck.bind(this));
    }

    // Metrics endpoint
    if (this.config.enableMetrics) {
      this.fastify.get('/metrics', this.handleMetrics.bind(this));
    }

    // Task management endpoints
    this.fastify.post('/tasks', {
      schema: {
        body: {
          type: 'object',
          required: ['task'],
          properties: {
            task: { type: 'object' },
            options: { type: 'object' }
          }
        }
      }
    }, this.handleTaskSubmission.bind(this));

    this.fastify.get('/tasks/:taskId', this.handleTaskStatus.bind(this));
    this.fastify.delete('/tasks/:taskId', this.handleTaskCancellation.bind(this));
    this.fastify.get('/tasks', this.handleTaskList.bind(this));

    // Worker status endpoints
    this.fastify.get('/status', this.handleWorkerStatus.bind(this));
    this.fastify.get('/capabilities', this.handleWorkerCapabilities.bind(this));

    // Process management endpoints
    this.fastify.get('/processes', this.handleProcessList.bind(this));
    this.fastify.post('/processes/cleanup', this.handleProcessCleanup.bind(this));

    // Error handler
    this.fastify.setErrorHandler(this.handleError.bind(this));
  }

  /**
   * Set up event handlers
   */
  private setupEventHandlers(): void {
    this.taskEngine.on('task-started', (execution: any) => {
      this.emit('task-started', execution);
    });

    this.taskEngine.on('task-completed', (execution: any, result: any) => {
      this.taskMetrics.completed++;
      if (result && result.duration) {
        this.taskMetrics.executionTimes.push(result.duration);
      }
      this.activeTasks.delete(execution.task.id);
      this.emit('task-completed', execution, result);
    });

    this.taskEngine.on('task-failed', (execution: any, error: any) => {
      this.taskMetrics.failed++;
      this.activeTasks.delete(execution.task.id);
      this.emit('task-failed', execution, error);
    });

    this.taskEngine.on('task-progress', (execution: any, progress: any) => {
      this.emit('task-progress', execution, progress);
    });
  }

  /**
   * Start the server
   */
  async start(): Promise<void> {
    try {
      await this.fastify.listen({
        host: this.config.host,
        port: this.config.port
      });

      this.fastify.log.info(
        `Worker server started on ${this.config.host}:${this.config.port}`
      );
      this.emit('started');
    } catch (error) {
      this.fastify.log.error(error, 'Failed to start server');
      throw error;
    }
  }

  /**
   * Stop the server
   */
  async stop(): Promise<void> {
    try {
      // Cancel all active tasks
      for (const [taskId] of this.activeTasks) {
        try {
          await this.taskEngine.cancelTask(taskId);
        } catch (error) {
          this.fastify.log.warn(error, `Failed to cancel task ${taskId}:`);
        }
      }

      // Shutdown process pool
      await this.processPool.shutdown();

      // Close server
      await this.fastify.close();
      
      this.emit('stopped');
    } catch (error) {
      this.fastify.log.error(error, 'Failed to stop server');
      throw error;
    }
  }

  /**
   * Handle task submission
   */
  private async handleTaskSubmission(
    request: FastifyRequest<{ Body: TaskSubmissionRequest }>,
    reply: FastifyReply
  ): Promise<void> {
    const { task, options } = request.body;

    try {
      // Validate task
      if (!task || !task.id || !task.title) {
        return reply.code(400).send({
          error: 'Invalid task',
          message: 'Task must have id and title'
        });
      }

      // Check if task already exists
      if (this.activeTasks.has(task.id)) {
        return reply.code(409).send({
          error: 'Task already exists',
          taskId: task.id
        });
      }

      // Submit task for execution
      this.taskMetrics.total++;
      const executionPromise = this.taskEngine.executeTask(task, options);
      this.activeTasks.set(task.id, executionPromise);

      reply.code(202).send({
        message: 'Task submitted',
        taskId: task.id,
        status: 'pending'
      });
    } catch (error) {
      this.fastify.log.error(error, 'Task submission failed:');
      reply.code(500).send({
        error: 'Task submission failed',
        message: error instanceof Error ? error.message : String(error)
      });
    }
  }

  /**
   * Handle task status request
   */
  private async handleTaskStatus(
    request: FastifyRequest<{ Params: { taskId: string } }>,
    reply: FastifyReply
  ): Promise<void> {
    const { taskId } = request.params;

    try {
      // For now, return basic status based on active tasks
      if (this.activeTasks.has(taskId)) {
        reply.send({
          taskId,
          status: 'running',
          progress: 0.5,
          startTime: new Date(),
          duration: 0,
          artifacts: []
        });
      } else {
        return reply.code(404).send({
          error: 'Task not found',
          taskId
        });
      }
    } catch (error) {
      this.fastify.log.error(error, 'Task status failed:');
      reply.code(500).send({
        error: 'Failed to get task status',
        message: error instanceof Error ? error.message : String(error)
      });
    }
  }

  /**
   * Handle task cancellation
   */
  private async handleTaskCancellation(
    request: FastifyRequest<{ Params: { taskId: string } }>,
    reply: FastifyReply
  ): Promise<void> {
    const { taskId } = request.params;

    try {
      await this.taskEngine.cancelTask(taskId);
      this.activeTasks.delete(taskId);

      reply.send({
        message: 'Task cancelled',
        taskId
      });
    } catch (error) {
      this.fastify.log.error(error, 'Task cancellation failed:');
      reply.code(500).send({
        error: 'Failed to cancel task',
        message: error instanceof Error ? error.message : String(error)
      });
    }
  }

  /**
   * Handle task list request
   */
  private async handleTaskList(
    request: FastifyRequest,
    reply: FastifyReply
  ): Promise<void> {
    try {
      const activeTasks = Array.from(this.activeTasks.keys());
      
      reply.send({
        tasks: activeTasks.map(taskId => ({
          taskId,
          title: 'Task',
          status: 'running',
          progress: 0.5,
          startTime: new Date(),
          duration: 0
        }))
      });
    } catch (error) {
      this.fastify.log.error(error, 'Task list failed:');
      reply.code(500).send({
        error: 'Failed to get task list',
        message: error instanceof Error ? error.message : String(error)
      });
    }
  }

  /**
   * Handle health check
   */
  private async handleHealthCheck(
    request: FastifyRequest,
    reply: FastifyReply
  ): Promise<void> {
    try {
      const processStats = this.processPool.getStats();
      const isHealthy = processStats.total > 0;

      const response: HealthCheckResponse = {
        status: isHealthy ? 'healthy' : 'unhealthy',
        timestamp: new Date().toISOString(),
        uptime: process.uptime() * 1000,
        version: process.env.npm_package_version || '0.1.0',
        worker: {
          status: isHealthy ? 'idle' : 'starting',
          capabilities: await this.getCapabilities(),
          processPool: processStats,
          activeTasks: this.activeTasks.size
        },
        system: {
          memoryUsage: process.memoryUsage(),
          cpuUsage: process.cpuUsage(this.cpuUsageStart),
          platform: process.platform,
          nodeVersion: process.version
        }
      };

      reply.code(isHealthy ? 200 : 503).send(response);
    } catch (error) {
      this.fastify.log.error(error, 'Health check failed:');
      reply.code(503).send({
        status: 'unhealthy',
        timestamp: new Date().toISOString(),
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }

  /**
   * Handle readiness check
   */
  private async handleReadinessCheck(
    request: FastifyRequest,
    reply: FastifyReply
  ): Promise<void> {
    const processStats = this.processPool.getStats();
    const isReady = processStats.available > 0;

    reply.code(isReady ? 200 : 503).send({
      ready: isReady,
      processPool: processStats,
      timestamp: new Date().toISOString()
    });
  }

  /**
   * Handle liveness check
   */
  private async handleLivenessCheck(
    request: FastifyRequest,
    reply: FastifyReply
  ): Promise<void> {
    reply.send({
      alive: true,
      timestamp: new Date().toISOString(),
      uptime: process.uptime() * 1000
    });
  }

  /**
   * Handle metrics request
   */
  private async handleMetrics(
    request: FastifyRequest,
    reply: FastifyReply
  ): Promise<void> {
    try {
      const processStats = this.processPool.getStats();
      const uptime = (Date.now() - this.taskMetrics.startTime) / 1000 / 60; // minutes
      const avgExecutionTime = this.taskMetrics.executionTimes.length > 0
        ? this.taskMetrics.executionTimes.reduce((a, b) => a + b, 0) / this.taskMetrics.executionTimes.length
        : 0;

      const response: MetricsResponse = {
        tasks: {
          total: this.taskMetrics.total,
          completed: this.taskMetrics.completed,
          failed: this.taskMetrics.failed,
          running: this.activeTasks.size,
          pending: Math.max(0, this.taskMetrics.total - this.taskMetrics.completed - this.taskMetrics.failed - this.activeTasks.size)
        },
        performance: {
          averageExecutionTime: avgExecutionTime,
          successRate: this.taskMetrics.total > 0 
            ? this.taskMetrics.completed / this.taskMetrics.total 
            : 0,
          throughput: uptime > 0 ? this.taskMetrics.completed / uptime : 0
        },
        resources: {
          memoryUsage: process.memoryUsage(),
          cpuUsage: process.cpuUsage(this.cpuUsageStart),
          processPoolStats: processStats
        }
      };

      reply.send(response);
    } catch (error) {
      this.fastify.log.error(error, 'Metrics failed:');
      reply.code(500).send({
        error: 'Failed to get metrics',
        message: error instanceof Error ? error.message : String(error)
      });
    }
  }

  /**
   * Handle worker status request
   */
  private async handleWorkerStatus(
    request: FastifyRequest,
    reply: FastifyReply
  ): Promise<void> {
    try {
      const processStats = this.processPool.getStats();
      
      reply.send({
        status: processStats.total > 0 ? 'idle' : 'starting',
        activeTasks: this.activeTasks.size,
        processPool: processStats,
        uptime: process.uptime() * 1000,
        memoryUsage: process.memoryUsage()
      });
    } catch (error) {
      this.fastify.log.error(error, 'Worker status failed:');
      reply.code(500).send({
        error: 'Failed to get worker status',
        message: error instanceof Error ? error.message : String(error)
      });
    }
  }

  /**
   * Handle worker capabilities request
   */
  private async handleWorkerCapabilities(
    request: FastifyRequest,
    reply: FastifyReply
  ): Promise<void> {
    try {
      const capabilities = await this.getCapabilities();
      reply.send(capabilities);
    } catch (error) {
      this.fastify.log.error(error, 'Worker capabilities failed:');
      reply.code(500).send({
        error: 'Failed to get worker capabilities',
        message: error instanceof Error ? error.message : String(error)
      });
    }
  }

  /**
   * Handle process list request
   */
  private async handleProcessList(
    request: FastifyRequest,
    reply: FastifyReply
  ): Promise<void> {
    try {
      const stats = this.processPool.getStats();
      
      reply.send({
        processPool: stats,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      this.fastify.log.error(error, 'Process list failed:');
      reply.code(500).send({
        error: 'Failed to get process list',
        message: error instanceof Error ? error.message : String(error)
      });
    }
  }

  /**
   * Handle process cleanup request
   */
  private async handleProcessCleanup(
    request: FastifyRequest,
    reply: FastifyReply
  ): Promise<void> {
    try {
      // This would implement cleanup logic for stale processes
      // For now, just return success
      reply.send({
        message: 'Process cleanup initiated',
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      this.fastify.log.error(error, 'Process cleanup failed:');
      reply.code(500).send({
        error: 'Failed to cleanup processes',
        message: error instanceof Error ? error.message : String(error)
      });
    }
  }

  /**
   * Handle server errors
   */
  private async handleError(
    error: Error,
    request: FastifyRequest,
    reply: FastifyReply
  ): Promise<void> {
    this.fastify.log.error(error);
    
    reply.code(500).send({
      error: 'Internal server error',
      message: process.env.NODE_ENV === 'development' ? error.message : 'An internal error occurred',
      timestamp: new Date().toISOString()
    });
  }

  /**
   * Get worker capabilities
   */
  private async getCapabilities(): Promise<WorkerCapabilities> {
    return {
      supportedCategories: ['coding' as TaskCategory, 'analysis' as TaskCategory, 'refactoring' as TaskCategory, 'testing' as TaskCategory, 'documentation' as TaskCategory],
      maxConcurrentTasks: this.config.maxConcurrentTasks,
      supportsStreaming: true,
      supportsFileOperations: true,
      supportsNetworking: true,
      claudeCodeVersion: 'latest',
      nodeVersion: process.version,
      operatingSystem: process.platform,
      architecture: process.arch
    };
  }

  /**
   * Get server instance (for testing)
   */
  getServer(): FastifyInstance {
    return this.fastify;
  }

  /**
   * Get active task count
   */
  getActiveTaskCount(): number {
    return this.activeTasks.size;
  }

  /**
   * Get task metrics
   */
  getTaskMetrics(): typeof this.taskMetrics {
    return { ...this.taskMetrics };
  }
}