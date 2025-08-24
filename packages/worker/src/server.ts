import Fastify, { FastifyInstance } from 'fastify';
import { config } from './config';
import { logger } from './logger';
import { HealthService } from './health';
import { healthResponseSchema, taskSubmissionRequestSchema, taskSubmissionResponseSchema } from './schemas';
import { TaskExecutionService } from './execution';

export class WorkerServer {
  private app: FastifyInstance;
  private port: number;
  private healthService: HealthService;
  private executionService: TaskExecutionService;

  constructor() {
    this.port = config.port;
    this.healthService = new HealthService();
    this.executionService = new TaskExecutionService();
    
    // Inject dependencies
    this.executionService.setHealthService(this.healthService);
    
    // Initialize Fastify with logger configuration
    this.app = Fastify({
      logger: logger,
      trustProxy: true
    });

    this.setupRoutes();
  }

  private setupRoutes(): void {
    // Health check endpoint with Zod validation
    this.app.get('/hello', {
      schema: {
        response: {
          200: healthResponseSchema
        }
      }
    }, async (request, reply) => {
      try {
        const actualTaskCount = this.executionService.getActiveTaskCount();
        const healthInfo = this.healthService.getHealthInfo(actualTaskCount);
        return healthInfo;
      } catch (error) {
        logger.error('Error generating health response:', error);
        reply.status(500);
        return { 
          error: 'Internal server error',
          message: 'Unable to generate health information'
        };
      }
    });

    // PTY status and control endpoint
    this.app.get('/pty/status', async (request, reply) => {
      try {
        const factoryInfo = this.executionService.getFactory().getFactoryInfo();
        return {
          ...factoryInfo,
          activeProcesses: this.executionService.getTaskExecutor().constructor.name === 'PTYTaskExecutor' 
            ? (this.executionService.getTaskExecutor() as any).getProcessCount() 
            : 0
        };
      } catch (error) {
        logger.error('Error getting PTY status:', error);
        reply.status(500);
        return { error: 'Failed to get PTY status' };
      }
    });

    // Switch execution mode endpoint (for testing)
    this.app.post('/pty/switch', {
      schema: {
        body: {
          type: 'object',
          properties: {
            executorType: { type: 'string', enum: ['stub', 'pty'] },
            streamingType: { type: 'string', enum: ['stub', 'sse'] }
          }
        }
      }
    }, async (request, reply) => {
      try {
        const { executorType, streamingType } = request.body as any;
        this.executionService.reinitializeWithTypes(executorType, streamingType);
        
        return { 
          message: 'Execution components switched successfully',
          newConfig: this.executionService.getFactory().getFactoryInfo()
        };
      } catch (error) {
        logger.error('Error switching execution mode:', error);
        reply.status(500);
        return { error: 'Failed to switch execution mode' };
      }
    });

    // Task execution endpoint with Zod validation
    this.app.post('/run', {
      schema: {
        body: taskSubmissionRequestSchema,
        response: {
          200: taskSubmissionResponseSchema,
          400: {
            type: 'object',
            properties: {
              error: { type: 'string' },
              message: { type: 'string' },
              details: { type: 'object' }
            }
          }
        }
      }
    }, async (request, reply) => {
      try {
        const taskRequest = request.body as any;
        
        logger.info('Received task execution request', {
          promptLength: taskRequest.prompt?.length || 0,
          workerId: taskRequest.workerId,
          priority: taskRequest.priority
        });

        // Validate that worker is available for new tasks
        const currentStatus = this.healthService.getStatus();
        if (currentStatus === 'offline' || currentStatus === 'error') {
          reply.status(503);
          return {
            error: 'Service unavailable',
            message: `Worker is currently ${currentStatus} and cannot accept new tasks`
          };
        }

        // Submit task for execution
        const response = await this.executionService.submitTask(taskRequest);
        
        return response;
      } catch (error) {
        logger.error('Error processing task submission:', error);
        reply.status(500);
        return {
          error: 'Internal server error',
          message: 'Failed to process task submission',
          details: config.nodeEnv === 'development' ? error : undefined
        };
      }
    });
  }

  async start(): Promise<void> {
    try {
      await this.app.listen({
        port: this.port,
        host: config.host
      });
      
      logger.info(`🚀 Worker server listening on ${config.host}:${this.port}`);
    } catch (error) {
      logger.error('Failed to start server:', error);
      process.exit(1);
    }
  }

  async stop(): Promise<void> {
    try {
      await this.app.close();
      logger.info('🛑 Worker server stopped');
    } catch (error) {
      logger.error('Error stopping server:', error);
    }
  }

  getApp(): FastifyInstance {
    return this.app;
  }

  getHealthService(): HealthService {
    return this.healthService;
  }

  getExecutionService(): TaskExecutionService {
    return this.executionService;
  }
}