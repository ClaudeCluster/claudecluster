/**
 * @fileoverview Fastify HTTP API server for Driver
 */

import Fastify, { type FastifyInstance, type FastifyRequest, type FastifyReply } from 'fastify';
import type { Task, TaskResult, Worker, TaskProgress } from '@claudecluster/core';
import { TaskOrchestrator, type OrchestratorConfig, type OrchestrationStats } from '../orchestrator/index.js';
import { EventEmitter } from 'events';

/**
 * Driver server configuration
 */
export interface DriverServerConfig extends Partial<OrchestratorConfig> {
  readonly host: string;
  readonly port: number;
  readonly enableCORS: boolean;
  readonly enableWebSocket: boolean;
  readonly requestTimeout: number;
  readonly corsOrigin?: string | string[];
  readonly enableMetrics: boolean;
  readonly enableHealthCheck: boolean;
}

/**
 * Default driver server configuration
 */
export const DEFAULT_DRIVER_CONFIG: DriverServerConfig = {
  host: '0.0.0.0',
  port: 3000,
  enableCORS: true,
  enableWebSocket: true,
  requestTimeout: 600000, // 10 minutes
  enableMetrics: true,
  enableHealthCheck: true,
  driverId: 'default-driver',
  maxConcurrentTasks: 100,
  taskTimeout: 600000,
  workerHealthCheckInterval: 30000,
  resultAggregationTimeout: 5000,
  enableTaskDecomposition: true,
  enableResultMerging: true,
  retryFailedTasks: true
};

/**
 * Task submission request
 */
interface TaskSubmissionRequest {
  task: Task;
  priority?: 'critical' | 'high' | 'normal' | 'low' | 'background';
  timeout?: number;
  metadata?: Record<string, unknown>;
}

/**
 * Batch task submission request
 */
interface BatchTaskSubmissionRequest {
  tasks: Task[];
  parallel?: boolean;
  priority?: 'critical' | 'high' | 'normal' | 'low' | 'background';
}

/**
 * Worker registration request
 */
interface WorkerRegistrationRequest {
  worker: Worker;
  healthCheckUrl?: string;
}

/**
 * Health check response
 */
interface DriverHealthResponse {
  status: 'healthy' | 'unhealthy';
  timestamp: string;
  uptime: number;
  version: string;
  driver: {
    id: string;
    status: string;
    stats: OrchestrationStats;
  };
  workers: {
    total: number;
    active: number;
    healthy: number;
  };
  system: {
    memoryUsage: NodeJS.MemoryUsage;
    cpuUsage: NodeJS.CpuUsage;
    platform: string;
    nodeVersion: string;
  };
}

/**
 * Driver HTTP API server
 */
export class DriverServer extends EventEmitter {
  private fastify: FastifyInstance;
  private orchestrator: TaskOrchestrator;
  private cpuUsageStart: NodeJS.CpuUsage;
  private startTime: Date;

  constructor(private config: DriverServerConfig = DEFAULT_DRIVER_CONFIG) {
    super();
    
    this.startTime = new Date();
    this.cpuUsageStart = process.cpuUsage();
    
    // Initialize Fastify
    this.fastify = Fastify({
      logger: {
        level: 'info',
        prettyPrint: process.env.NODE_ENV === 'development'
      },
      requestTimeout: config.requestTimeout
    });

    // Initialize orchestrator
    this.orchestrator = new TaskOrchestrator(config);
    
    // Set up routes and event handlers
    this.setupRoutes();
    this.setupEventHandlers();
  }

  /**
   * Set up Fastify routes
   */
  private setupRoutes(): void {
    // CORS support
    if (this.config.enableCORS) {
      this.fastify.register(require('@fastify/cors'), {
        origin: this.config.corsOrigin || true
      });
    }

    // WebSocket support
    if (this.config.enableWebSocket) {
      this.fastify.register(require('@fastify/websocket'));
      this.setupWebSocketRoutes();
    }

    // Health check endpoints
    if (this.config.enableHealthCheck) {
      this.fastify.get('/health', this.handleHealthCheck.bind(this));
      this.fastify.get('/health/ready', this.handleReadinessCheck.bind(this));
      this.fastify.get('/health/live', this.handleLivenessCheck.bind(this));
    }

    // Metrics endpoint
    if (this.config.enableMetrics) {
      this.fastify.get('/metrics', this.handleMetrics.bind(this));
      this.fastify.get('/stats', this.handleStats.bind(this));
    }

    // Task management endpoints
    this.fastify.post('/tasks', {
      schema: {
        body: {
          type: 'object',
          required: ['task'],
          properties: {
            task: { type: 'object' },
            priority: { type: 'string', enum: ['critical', 'high', 'normal', 'low', 'background'] },
            timeout: { type: 'number' },
            metadata: { type: 'object' }
          }
        }
      }
    }, this.handleTaskSubmission.bind(this));

    this.fastify.post('/tasks/batch', {
      schema: {
        body: {
          type: 'object',
          required: ['tasks'],
          properties: {
            tasks: { type: 'array', items: { type: 'object' } },
            parallel: { type: 'boolean' },
            priority: { type: 'string', enum: ['critical', 'high', 'normal', 'low', 'background'] }
          }
        }
      }
    }, this.handleBatchTaskSubmission.bind(this));

    this.fastify.get('/tasks/:taskId', this.handleTaskStatus.bind(this));
    this.fastify.get('/tasks/:taskId/result', this.handleTaskResult.bind(this));
    this.fastify.get('/tasks/:taskId/progress', this.handleTaskProgress.bind(this));
    this.fastify.delete('/tasks/:taskId', this.handleTaskCancellation.bind(this));
    this.fastify.get('/tasks', this.handleTaskList.bind(this));

    // Worker management endpoints
    this.fastify.post('/workers', this.handleWorkerRegistration.bind(this));
    this.fastify.delete('/workers/:workerId', this.handleWorkerUnregistration.bind(this));
    this.fastify.get('/workers', this.handleWorkerList.bind(this));
    this.fastify.get('/workers/:workerId', this.handleWorkerDetails.bind(this));
    this.fastify.get('/workers/:workerId/health', this.handleWorkerHealth.bind(this));

    // Driver management endpoints
    this.fastify.get('/driver', this.handleDriverStatus.bind(this));
    this.fastify.post('/driver/start', this.handleDriverStart.bind(this));
    this.fastify.post('/driver/stop', this.handleDriverStop.bind(this));

    // Scheduler endpoints
    this.fastify.get('/scheduler/stats', this.handleSchedulerStats.bind(this));
    this.fastify.get('/scheduler/queue', this.handleSchedulerQueue.bind(this));
    this.fastify.get('/scheduler/plans', this.handleSchedulerPlans.bind(this));

    // Error handler
    this.fastify.setErrorHandler(this.handleError.bind(this));
  }

  /**
   * Set up WebSocket routes
   */
  private setupWebSocketRoutes(): void {
    // Real-time task progress
    this.fastify.register(async (fastify) => {
      fastify.get('/ws/tasks/:taskId/progress', { websocket: true }, (connection, request) => {
        const taskId = (request.params as any).taskId;
        
        const progressHandler = (id: string, progress: TaskProgress) => {
          if (id === taskId) {
            connection.socket.send(JSON.stringify({ type: 'progress', data: progress }));
          }
        };
        
        const completionHandler = (id: string, result: TaskResult) => {
          if (id === taskId) {
            connection.socket.send(JSON.stringify({ type: 'completed', data: result }));
          }
        };
        
        const failureHandler = (id: string, error: Error) => {
          if (id === taskId) {
            connection.socket.send(JSON.stringify({ type: 'failed', data: { error: error.message } }));
          }
        };
        
        this.orchestrator.on('task-progress', progressHandler);
        this.orchestrator.on('task-completed', completionHandler);
        this.orchestrator.on('task-failed', failureHandler);
        
        connection.socket.on('close', () => {
          this.orchestrator.off('task-progress', progressHandler);
          this.orchestrator.off('task-completed', completionHandler);
          this.orchestrator.off('task-failed', failureHandler);
        });
      });
    });

    // Real-time driver stats
    this.fastify.register(async (fastify) => {
      fastify.get('/ws/stats', { websocket: true }, (connection, request) => {
        const statsHandler = (stats: OrchestrationStats) => {
          connection.socket.send(JSON.stringify({ type: 'stats', data: stats }));
        };
        
        this.orchestrator.on('stats-updated', statsHandler);
        
        connection.socket.on('close', () => {
          this.orchestrator.off('stats-updated', statsHandler);
        });
        
        // Send initial stats
        const initialStats = this.orchestrator.getStats();
        connection.socket.send(JSON.stringify({ type: 'stats', data: initialStats }));
      });
    });
  }

  /**
   * Set up event handlers
   */
  private setupEventHandlers(): void {
    this.orchestrator.on('task-submitted', (task) => {
      this.emit('task-submitted', task);
    });

    this.orchestrator.on('task-completed', (taskId, result) => {
      this.emit('task-completed', taskId, result);
    });

    this.orchestrator.on('task-failed', (taskId, error) => {
      this.emit('task-failed', taskId, error);
    });

    this.orchestrator.on('worker-registered', (worker) => {
      this.emit('worker-registered', worker);
    });

    this.orchestrator.on('worker-unregistered', (workerId) => {
      this.emit('worker-unregistered', workerId);
    });
  }

  /**
   * Start the server
   */
  async start(): Promise<void> {
    try {
      // Start orchestrator
      await this.orchestrator.start();
      
      // Start Fastify server
      await this.fastify.listen({
        host: this.config.host,
        port: this.config.port
      });

      this.fastify.log.info(
        `Driver server started on ${this.config.host}:${this.config.port}`
      );
      this.emit('started');
      
    } catch (error) {
      this.fastify.log.error('Failed to start server', error);
      throw error;
    }
  }

  /**
   * Stop the server
   */
  async stop(): Promise<void> {
    try {
      // Stop orchestrator
      await this.orchestrator.stop();
      
      // Close server
      await this.fastify.close();
      
      this.emit('stopped');
    } catch (error) {
      this.fastify.log.error('Failed to stop server', error);
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
    const { task, priority, timeout, metadata } = request.body;

    try {
      // Enhance task with additional properties
      const enhancedTask: Task = {
        ...task,
        priority: priority || task.priority || 'normal',
        metadata: { ...task.metadata, ...metadata }
      };

      await this.orchestrator.submitTask(enhancedTask);

      reply.code(202).send({
        message: 'Task submitted successfully',
        taskId: task.id,
        status: 'pending'
      });
    } catch (error) {
      this.fastify.log.error('Task submission failed:', error);
      reply.code(400).send({
        error: 'Task submission failed',
        message: error instanceof Error ? error.message : String(error)
      });
    }
  }

  /**
   * Handle batch task submission
   */
  private async handleBatchTaskSubmission(
    request: FastifyRequest<{ Body: BatchTaskSubmissionRequest }>,
    reply: FastifyReply
  ): Promise<void> {
    const { tasks, parallel = true, priority } = request.body;

    try {
      const results = [];

      if (parallel) {
        // Submit all tasks in parallel
        const submissions = tasks.map(async (task) => {
          const enhancedTask: Task = {
            ...task,
            priority: priority || task.priority || 'normal'
          };
          
          await this.orchestrator.submitTask(enhancedTask);
          return { taskId: task.id, status: 'pending' };
        });

        const submissionResults = await Promise.allSettled(submissions);
        
        for (const result of submissionResults) {
          if (result.status === 'fulfilled') {
            results.push(result.value);
          } else {
            results.push({
              error: result.reason instanceof Error ? result.reason.message : String(result.reason)
            });
          }
        }
      } else {
        // Submit tasks sequentially
        for (const task of tasks) {
          try {
            const enhancedTask: Task = {
              ...task,
              priority: priority || task.priority || 'normal'
            };
            
            await this.orchestrator.submitTask(enhancedTask);
            results.push({ taskId: task.id, status: 'pending' });
          } catch (error) {
            results.push({
              taskId: task.id,
              error: error instanceof Error ? error.message : String(error)
            });
          }
        }
      }

      reply.code(202).send({
        message: 'Batch task submission completed',
        results
      });
    } catch (error) {
      this.fastify.log.error('Batch task submission failed:', error);
      reply.code(400).send({
        error: 'Batch task submission failed',
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
      const status = this.orchestrator.getTaskStatus(taskId);
      const progress = this.orchestrator.getTaskProgress(taskId);
      
      reply.send({
        taskId,
        status,
        progress: progress?.progress || 0,
        startTime: progress?.startTime,
        currentStep: progress?.currentStep,
        estimatedTimeRemaining: progress?.estimatedTimeRemaining
      });
    } catch (error) {
      this.fastify.log.error('Task status failed:', error);
      reply.code(500).send({
        error: 'Failed to get task status',
        message: error instanceof Error ? error.message : String(error)
      });
    }
  }

  /**
   * Handle task result request
   */
  private async handleTaskResult(
    request: FastifyRequest<{ Params: { taskId: string } }>,
    reply: FastifyReply
  ): Promise<void> {
    const { taskId } = request.params;

    try {
      const result = this.orchestrator.getTaskResult(taskId);
      
      if (!result) {
        return reply.code(404).send({
          error: 'Task result not found',
          taskId
        });
      }

      reply.send(result);
    } catch (error) {
      this.fastify.log.error('Task result failed:', error);
      reply.code(500).send({
        error: 'Failed to get task result',
        message: error instanceof Error ? error.message : String(error)
      });
    }
  }

  /**
   * Handle task progress request
   */
  private async handleTaskProgress(
    request: FastifyRequest<{ Params: { taskId: string } }>,
    reply: FastifyReply
  ): Promise<void> {
    const { taskId } = request.params;

    try {
      const progress = this.orchestrator.getTaskProgress(taskId);
      
      if (!progress) {
        return reply.code(404).send({
          error: 'Task progress not found',
          taskId
        });
      }

      reply.send(progress);
    } catch (error) {
      this.fastify.log.error('Task progress failed:', error);
      reply.code(500).send({
        error: 'Failed to get task progress',
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
      await this.orchestrator.cancelTask(taskId);
      
      reply.send({
        message: 'Task cancelled successfully',
        taskId
      });
    } catch (error) {
      this.fastify.log.error('Task cancellation failed:', error);
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
      const contexts = this.orchestrator.getExecutionContexts();
      const stats = this.orchestrator.getStats();
      
      reply.send({
        summary: {
          total: stats.totalTasks,
          running: stats.runningTasks,
          completed: stats.completedTasks,
          failed: stats.failedTasks,
          queued: stats.queuedTasks
        },
        runningTasks: Array.from(contexts.entries()).map(([taskId, context]) => ({
          taskId,
          workerId: context.workerId,
          status: context.status,
          progress: context.progress,
          startTime: context.startTime
        }))
      });
    } catch (error) {
      this.fastify.log.error('Task list failed:', error);
      reply.code(500).send({
        error: 'Failed to get task list',
        message: error instanceof Error ? error.message : String(error)
      });
    }
  }

  /**
   * Handle worker registration
   */
  private async handleWorkerRegistration(
    request: FastifyRequest<{ Body: WorkerRegistrationRequest }>,
    reply: FastifyReply
  ): Promise<void> {
    const { worker } = request.body;

    try {
      await this.orchestrator.registerWorker(worker);
      
      reply.code(201).send({
        message: 'Worker registered successfully',
        workerId: worker.id
      });
    } catch (error) {
      this.fastify.log.error('Worker registration failed:', error);
      reply.code(400).send({
        error: 'Worker registration failed',
        message: error instanceof Error ? error.message : String(error)
      });
    }
  }

  /**
   * Handle worker unregistration
   */
  private async handleWorkerUnregistration(
    request: FastifyRequest<{ Params: { workerId: string } }>,
    reply: FastifyReply
  ): Promise<void> {
    const { workerId } = request.params;

    try {
      await this.orchestrator.unregisterWorker(workerId);
      
      reply.send({
        message: 'Worker unregistered successfully',
        workerId
      });
    } catch (error) {
      this.fastify.log.error('Worker unregistration failed:', error);
      reply.code(500).send({
        error: 'Failed to unregister worker',
        message: error instanceof Error ? error.message : String(error)
      });
    }
  }

  /**
   * Handle worker list request
   */
  private async handleWorkerList(
    request: FastifyRequest,
    reply: FastifyReply
  ): Promise<void> {
    try {
      const workers = this.orchestrator.getWorkers();
      
      reply.send({
        workers: workers.map(worker => ({
          id: worker.id,
          name: worker.name,
          status: worker.status,
          endpoint: worker.endpoint,
          capabilities: worker.capabilities,
          health: worker.health,
          currentTasks: worker.currentTasks.length
        }))
      });
    } catch (error) {
      this.fastify.log.error('Worker list failed:', error);
      reply.code(500).send({
        error: 'Failed to get worker list',
        message: error instanceof Error ? error.message : String(error)
      });
    }
  }

  /**
   * Handle worker details request
   */
  private async handleWorkerDetails(
    request: FastifyRequest<{ Params: { workerId: string } }>,
    reply: FastifyReply
  ): Promise<void> {
    const { workerId } = request.params;

    try {
      const workers = this.orchestrator.getWorkers();
      const worker = workers.find(w => w.id === workerId);
      
      if (!worker) {
        return reply.code(404).send({
          error: 'Worker not found',
          workerId
        });
      }

      reply.send(worker);
    } catch (error) {
      this.fastify.log.error('Worker details failed:', error);
      reply.code(500).send({
        error: 'Failed to get worker details',
        message: error instanceof Error ? error.message : String(error)
      });
    }
  }

  /**
   * Handle worker health request
   */
  private async handleWorkerHealth(
    request: FastifyRequest<{ Params: { workerId: string } }>,
    reply: FastifyReply
  ): Promise<void> {
    const { workerId } = request.params;

    try {
      const workers = this.orchestrator.getWorkers();
      const worker = workers.find(w => w.id === workerId);
      
      if (!worker) {
        return reply.code(404).send({
          error: 'Worker not found',
          workerId
        });
      }

      reply.send({
        workerId: worker.id,
        health: worker.health,
        status: worker.status,
        lastSeen: worker.lastSeenAt
      });
    } catch (error) {
      this.fastify.log.error('Worker health failed:', error);
      reply.code(500).send({
        error: 'Failed to get worker health',
        message: error instanceof Error ? error.message : String(error)
      });
    }
  }

  /**
   * Handle driver status request
   */
  private async handleDriverStatus(
    request: FastifyRequest,
    reply: FastifyReply
  ): Promise<void> {
    try {
      const stats = this.orchestrator.getStats();
      
      reply.send({
        driver: {
          id: this.orchestrator.id,
          name: this.orchestrator.name,
          status: this.orchestrator.status,
          version: this.orchestrator.version,
          uptime: stats.uptime
        },
        stats
      });
    } catch (error) {
      this.fastify.log.error('Driver status failed:', error);
      reply.code(500).send({
        error: 'Failed to get driver status',
        message: error instanceof Error ? error.message : String(error)
      });
    }
  }

  /**
   * Handle driver start request
   */
  private async handleDriverStart(
    request: FastifyRequest,
    reply: FastifyReply
  ): Promise<void> {
    try {
      await this.orchestrator.start();
      
      reply.send({
        message: 'Driver started successfully'
      });
    } catch (error) {
      this.fastify.log.error('Driver start failed:', error);
      reply.code(500).send({
        error: 'Failed to start driver',
        message: error instanceof Error ? error.message : String(error)
      });
    }
  }

  /**
   * Handle driver stop request
   */
  private async handleDriverStop(
    request: FastifyRequest,
    reply: FastifyReply
  ): Promise<void> {
    try {
      await this.orchestrator.stop();
      
      reply.send({
        message: 'Driver stopped successfully'
      });
    } catch (error) {
      this.fastify.log.error('Driver stop failed:', error);
      reply.code(500).send({
        error: 'Failed to stop driver',
        message: error instanceof Error ? error.message : String(error)
      });
    }
  }

  /**
   * Handle scheduler stats request
   */
  private async handleSchedulerStats(
    request: FastifyRequest,
    reply: FastifyReply
  ): Promise<void> {
    try {
      const scheduler = this.orchestrator.getScheduler();
      const stats = scheduler.getStats();
      
      reply.send(stats);
    } catch (error) {
      this.fastify.log.error('Scheduler stats failed:', error);
      reply.code(500).send({
        error: 'Failed to get scheduler stats',
        message: error instanceof Error ? error.message : String(error)
      });
    }
  }

  /**
   * Handle scheduler queue request
   */
  private async handleSchedulerQueue(
    request: FastifyRequest,
    reply: FastifyReply
  ): Promise<void> {
    try {
      const scheduler = this.orchestrator.getScheduler();
      const queuedTasks = scheduler.getQueuedTasks();
      
      reply.send({
        queue: queuedTasks.map(qt => ({
          taskId: qt.task.id,
          title: qt.task.title,
          category: qt.task.category,
          priority: qt.task.priority,
          queuedAt: qt.queuedAt,
          retryCount: qt.retryCount,
          assignedWorker: qt.assignedWorker
        }))
      });
    } catch (error) {
      this.fastify.log.error('Scheduler queue failed:', error);
      reply.code(500).send({
        error: 'Failed to get scheduler queue',
        message: error instanceof Error ? error.message : String(error)
      });
    }
  }

  /**
   * Handle scheduler plans request
   */
  private async handleSchedulerPlans(
    request: FastifyRequest,
    reply: FastifyReply
  ): Promise<void> {
    try {
      const scheduler = this.orchestrator.getScheduler();
      const plans = scheduler.getExecutionPlans();
      
      reply.send({
        plans
      });
    } catch (error) {
      this.fastify.log.error('Scheduler plans failed:', error);
      reply.code(500).send({
        error: 'Failed to get scheduler plans',
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
      const stats = this.orchestrator.getStats();
      const isHealthy = this.orchestrator.status === 'running';

      const response: DriverHealthResponse = {
        status: isHealthy ? 'healthy' : 'unhealthy',
        timestamp: new Date().toISOString(),
        uptime: Date.now() - this.startTime.getTime(),
        version: '0.1.0',
        driver: {
          id: this.orchestrator.id,
          status: this.orchestrator.status,
          stats
        },
        workers: {
          total: stats.totalWorkers,
          active: stats.activeWorkers,
          healthy: stats.activeWorkers // Simplified
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
      this.fastify.log.error('Health check failed:', error);
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
    const isReady = this.orchestrator.status === 'running';
    const stats = this.orchestrator.getStats();

    reply.code(isReady ? 200 : 503).send({
      ready: isReady,
      workers: stats.activeWorkers,
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
      uptime: Date.now() - this.startTime.getTime()
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
      const stats = this.orchestrator.getStats();
      const schedulerStats = this.orchestrator.getScheduler().getStats();
      
      reply.send({
        driver: stats,
        scheduler: schedulerStats,
        system: {
          memoryUsage: process.memoryUsage(),
          cpuUsage: process.cpuUsage(this.cpuUsageStart),
          uptime: process.uptime() * 1000
        }
      });
    } catch (error) {
      this.fastify.log.error('Metrics failed:', error);
      reply.code(500).send({
        error: 'Failed to get metrics',
        message: error instanceof Error ? error.message : String(error)
      });
    }
  }

  /**
   * Handle stats request
   */
  private async handleStats(
    request: FastifyRequest,
    reply: FastifyReply
  ): Promise<void> {
    try {
      const stats = this.orchestrator.getStats();
      reply.send(stats);
    } catch (error) {
      this.fastify.log.error('Stats failed:', error);
      reply.code(500).send({
        error: 'Failed to get stats',
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
   * Get server instance (for testing)
   */
  getServer(): FastifyInstance {
    return this.fastify;
  }

  /**
   * Get orchestrator instance
   */
  getOrchestrator(): TaskOrchestrator {
    return this.orchestrator;
  }

  /**
   * Get server URL
   */
  getServerUrl(): string {
    const { host, port } = this.config;
    const hostname = host === '0.0.0.0' ? 'localhost' : host;
    return `http://${hostname}:${port}`;
  }
}