import Fastify, { FastifyInstance } from 'fastify';
import { config } from './config';
import { logger } from './logger';
import { WorkerRegistry } from './worker-registry';
import { TaskManager } from './task-manager';
import { SSEManager } from './sse-manager';
import { 
  taskSubmissionRequestSchema, 
  taskSubmissionResponseSchema,
  healthResponseSchema,
  workersListResponseSchema,
  errorResponseSchema 
} from './schemas';

export class MCPServer {
  private app: FastifyInstance;
  private port: number;
  private workerRegistry: WorkerRegistry;
  private taskManager: TaskManager;
  private sseManager: SSEManager;
  private startTime: Date;

  constructor() {
    this.port = config.port;
    this.startTime = new Date();
    this.workerRegistry = new WorkerRegistry();
    this.taskManager = new TaskManager(this.workerRegistry);
    this.sseManager = new SSEManager(this.taskManager, this.workerRegistry);
    
    // Initialize Fastify with logger configuration
    this.app = Fastify({
      logger: logger,
      trustProxy: true
    });

    this.setupRoutes();
    this.setupErrorHandlers();
  }

  private setupRoutes(): void {
    // Health check endpoint
    this.app.get('/health', {
      schema: {
        response: {
          200: healthResponseSchema,
          500: errorResponseSchema
        }
      }
    }, async (request, reply) => {
      try {
        const uptime = Date.now() - this.startTime.getTime();
        const workers = await this.workerRegistry.getWorkersSummary();
        const tasks = await this.taskManager.getTasksSummary();

        const healthStatus = this.determineHealthStatus(workers, tasks);

        return {
          status: healthStatus,
          timestamp: new Date(),
          version: '0.1.0',
          uptime,
          workers,
          tasks,
          systemInfo: {
            nodeVersion: process.version,
            platform: process.platform,
            arch: process.arch,
            memoryUsage: process.memoryUsage()
          }
        };
      } catch (error) {
        logger.error('Error generating health response:', error);
        reply.status(500);
        return { 
          error: 'Internal server error',
          message: 'Unable to generate health information',
          timestamp: new Date()
        };
      }
    });

    // Task submission endpoint
    this.app.post('/tasks', {
      schema: {
        body: taskSubmissionRequestSchema,
        response: {
          200: taskSubmissionResponseSchema,
          400: errorResponseSchema,
          503: errorResponseSchema
        }
      }
    }, async (request, reply) => {
      try {
        const taskRequest = request.body as any;
        
        logger.info('Received task submission request', {
          promptLength: taskRequest.prompt?.length || 0,
          priority: taskRequest.priority
        });

        // Check if any workers are available
        const availableWorkers = await this.workerRegistry.getAvailableWorkers();
        if (availableWorkers.length === 0) {
          reply.status(503);
          return {
            error: 'Service unavailable',
            message: 'No workers currently available',
            timestamp: new Date()
          };
        }

        // Submit task for execution
        const response = await this.taskManager.submitTask(taskRequest);
        
        return response;
      } catch (error) {
        logger.error('Error processing task submission:', error);
        reply.status(500);
        return {
          error: 'Internal server error',
          message: 'Failed to process task submission',
          details: config.nodeEnv === 'development' ? error : undefined,
          timestamp: new Date()
        };
      }
    });

    // Workers list endpoint
    this.app.get('/workers', {
      schema: {
        response: {
          200: workersListResponseSchema,
          500: errorResponseSchema
        }
      }
    }, async (request, reply) => {
      try {
        const workersInfo = await this.workerRegistry.getAllWorkers();
        const summary = await this.workerRegistry.getWorkersSummary();
        
        return {
          workers: workersInfo,
          totalWorkers: workersInfo.length,
          availableWorkers: summary.available,
          totalActiveTasks: summary.total > 0 ? workersInfo.reduce((sum, w) => sum + w.activeTasks, 0) : 0
        };
      } catch (error) {
        logger.error('Error getting workers list:', error);
        reply.status(500);
        return {
          error: 'Internal server error',
          message: 'Failed to get workers information',
          timestamp: new Date()
        };
      }
    });

    // SSE stream endpoint - real implementation
    this.app.get('/stream/:taskId', async (request, reply) => {
      const { taskId } = request.params as { taskId: string };
      
      try {
        await this.sseManager.handleConnection(taskId, request, reply);
      } catch (error) {
        logger.error(`Error setting up SSE connection for task ${taskId}:`, error);
        reply.status(500).send({
          error: 'Failed to establish SSE connection',
          message: error instanceof Error ? error.message : 'Unknown error',
          timestamp: new Date()
        });
      }
    });
  }

  private setupErrorHandlers(): void {
    // Global error handler
    this.app.setErrorHandler((error, request, reply) => {
      logger.error('Unhandled error:', error);
      
      if (!reply.sent) {
        reply.status(500).send({
          error: 'Internal server error',
          message: 'An unexpected error occurred',
          timestamp: new Date()
        });
      }
    });

    // Not found handler
    this.app.setNotFoundHandler((request, reply) => {
      reply.status(404).send({
        error: 'Not found',
        message: `Route ${request.method} ${request.url} not found`,
        timestamp: new Date()
      });
    });
  }

  private determineHealthStatus(workers: any, tasks: any): 'healthy' | 'degraded' | 'unhealthy' {
    if (workers.total === 0) return 'unhealthy';
    if (workers.offline > 0 && workers.available === 0) return 'unhealthy';
    if (workers.offline > workers.available) return 'degraded';
    return 'healthy';
  }

  async start(): Promise<void> {
    try {
      // Initialize worker registry
      await this.workerRegistry.initialize();
      
      // Start the server
      await this.app.listen({
        port: this.port,
        host: config.host
      });
      
      logger.info(`🚀 MCP Server listening on ${config.host}:${this.port}`);
      logger.info('📡 Worker registry initialized with static configuration');
    } catch (error) {
      logger.error('Failed to start server:', error);
      process.exit(1);
    }
  }

  async stop(): Promise<void> {
    try {
      await this.sseManager.cleanup();
      await this.app.close();
      await this.workerRegistry.cleanup();
      logger.info('🛑 MCP Server stopped');
    } catch (error) {
      logger.error('Error stopping server:', error);
    }
  }

  getApp(): FastifyInstance {
    return this.app;
  }

  getWorkerRegistry(): WorkerRegistry {
    return this.workerRegistry;
  }

  getTaskManager(): TaskManager {
    return this.taskManager;
  }
}