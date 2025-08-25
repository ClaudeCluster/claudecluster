/**
 * @fileoverview Simplified MCP Container Server for testing container spawning functionality
 */

import { EventEmitter } from 'events';
import Fastify, { type FastifyInstance, type FastifyRequest, type FastifyReply } from 'fastify';
import { MCPContainerSpawnerTool, type ContainerExecutionResult, type ContainerSpawnerParams } from '../tools/container-spawner.js';
import { pino, type Logger } from 'pino';

/**
 * Container server configuration
 */
export interface ContainerServerConfig {
  readonly host: string;
  readonly port: number;
  readonly corsOrigin?: string | string[];
  readonly enableAuthentication: boolean;
  readonly jwtSecret?: string;
}

/**
 * Default container server configuration
 */
export const DEFAULT_CONTAINER_CONFIG: ContainerServerConfig = {
  host: '0.0.0.0',
  port: 3100,
  enableAuthentication: false
};

/**
 * Container Server implementation for testing MCP Container Spawner Tool
 */
export class ContainerServer extends EventEmitter {
  private readonly config: ContainerServerConfig;
  private fastify: FastifyInstance;
  private containerSpawner: MCPContainerSpawnerTool;
  private logger: Logger;
  private isRunning = false;

  constructor(config: Partial<ContainerServerConfig> = {}) {
    super();
    
    this.config = { ...DEFAULT_CONTAINER_CONFIG, ...config };
    
    // Initialize logger
    this.logger = pino({
      level: process.env['LOG_LEVEL'] || 'info',
      transport: process.env['NODE_ENV'] === 'development' ? {
        target: 'pino-pretty',
        options: {
          colorize: true
        }
      } : undefined
    });
    
    // Initialize Fastify
    this.fastify = Fastify({
      logger: false // Use our custom logger
    });

    // Initialize Container Spawner Tool
    this.containerSpawner = new MCPContainerSpawnerTool(this.logger);
    
    this.setupRoutes();
    this.setupEventHandlers();
  }

  /**
   * Set up Fastify routes
   */
  private setupRoutes(): void {
    // CORS
    if (this.config.corsOrigin) {
      this.fastify.register(require('@fastify/cors'), {
        origin: this.config.corsOrigin
      });
    }

    // Health check
    this.fastify.get('/health', this.handleHealthCheck.bind(this));
    
    // Server info
    this.fastify.get('/info', this.handleServerInfo.bind(this));

    // Container spawner endpoints
    this.fastify.post('/container/spawn', this.handleSpawnContainer.bind(this));
    this.fastify.get('/container/list', this.handleListContainers.bind(this));
    this.fastify.get('/container/docker-info', this.handleDockerInfo.bind(this));

    // Error handler
    this.fastify.setErrorHandler(this.handleError.bind(this));
  }

  /**
   * Handle health check
   */
  private async handleHealthCheck(
    request: FastifyRequest,
    reply: FastifyReply
  ): Promise<void> {
    reply.send({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      uptime: process.uptime() * 1000,
      containerSupport: true
    });
  }

  /**
   * Handle server info request
   */
  private async handleServerInfo(
    request: FastifyRequest,
    reply: FastifyReply
  ): Promise<void> {
    reply.send({
      name: 'ClaudeCluster Container Server',
      version: '0.1.0',
      capabilities: {
        containerSpawning: true,
        dockerIntegration: true
      },
      endpoints: {
        containerSpawn: '/container/spawn',
        containerList: '/container/list',
        dockerInfo: '/container/docker-info'
      }
    });
  }

  /**
   * Handle spawn container HTTP request
   */
  private async handleSpawnContainer(
    request: FastifyRequest<{ Body: ContainerSpawnerParams }>,
    reply: FastifyReply
  ): Promise<void> {
    this.logger.info({ body: request.body }, 'HTTP container spawn request');

    try {
      const result = await this.containerSpawner.execute(request.body);
      
      reply.send({
        success: true,
        data: result
      });

    } catch (error) {
      this.logger.error({ error }, 'Error spawning container via HTTP');
      
      reply.code(500).send({
        success: false,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }

  /**
   * Handle list active containers request
   */
  private async handleListContainers(
    request: FastifyRequest,
    reply: FastifyReply
  ): Promise<void> {
    try {
      const spawner = this.containerSpawner.getSpawner();
      const containers = await spawner.getActiveContainers();
      
      reply.send({
        success: true,
        data: {
          activeContainers: containers.length,
          containers
        }
      });

    } catch (error) {
      this.logger.error({ error }, 'Error listing containers');
      
      reply.code(500).send({
        success: false,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }

  /**
   * Handle Docker system info request
   */
  private async handleDockerInfo(
    request: FastifyRequest,
    reply: FastifyReply
  ): Promise<void> {
    try {
      const spawner = this.containerSpawner.getSpawner();
      const dockerInfo = await spawner.getSystemInfo();
      
      reply.send({
        success: true,
        data: dockerInfo
      });

    } catch (error) {
      this.logger.error({ error }, 'Error getting Docker info');
      
      reply.code(500).send({
        success: false,
        error: error instanceof Error ? error.message : String(error)
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
    this.logger.error({ error }, 'Server error');
    this.emit('error', error);
    
    reply.code(500).send({
      error: 'Internal server error',
      message: process.env['NODE_ENV'] === 'development' ? error.message : 'An internal error occurred'
    });
  }

  /**
   * Set up event handlers
   */
  private setupEventHandlers(): void {
    // Container spawner events
    const spawner = this.containerSpawner.getSpawner();
    
    spawner.on('container-created', (sessionId, containerId) => {
      this.logger.info({ sessionId, containerId }, 'Container created');
    });
    
    spawner.on('container-started', (sessionId, containerId) => {
      this.logger.info({ sessionId, containerId }, 'Container started');
    });
    
    spawner.on('container-stopped', (sessionId, containerId, exitCode) => {
      this.logger.info({ sessionId, containerId, exitCode }, 'Container stopped');
    });
    
    spawner.on('container-error', (sessionId, containerId, error) => {
      this.logger.error({ sessionId, containerId, error }, 'Container error');
    });
    
    spawner.on('execution-complete', (sessionId, result) => {
      this.logger.info({ 
        sessionId, 
        containerId: result.containerId, 
        exitCode: result.exitCode, 
        duration: result.duration 
      }, 'Container execution completed');
      
      this.emit('execution-complete', sessionId, result);
    });
  }

  /**
   * Start the container server
   */
  async start(): Promise<void> {
    if (this.isRunning) return;

    try {
      // Start Fastify server
      await this.fastify.listen({
        host: this.config.host,
        port: this.config.port
      });

      this.isRunning = true;
      this.logger.info({ 
        host: this.config.host, 
        port: this.config.port 
      }, 'Container Server started');
      
      this.emit('started');

    } catch (error) {
      this.logger.error({ error }, 'Failed to start Container server');
      throw error;
    }
  }

  /**
   * Stop the container server
   */
  async stop(): Promise<void> {
    if (!this.isRunning) return;

    try {
      // Cleanup container spawner
      await this.containerSpawner.cleanup();

      // Close Fastify server
      await this.fastify.close();

      this.isRunning = false;
      this.logger.info('Container Server stopped');
      this.emit('stopped');

    } catch (error) {
      this.logger.error({ error }, 'Error stopping Container server');
      throw error;
    }
  }

  /**
   * Get server URL
   */
  getServerUrl(): string {
    const { host, port } = this.config;
    const hostname = host === '0.0.0.0' ? 'localhost' : host;
    return `http://${hostname}:${port}`;
  }

  /**
   * Get container spawner for testing
   */
  getContainerSpawner(): MCPContainerSpawnerTool {
    return this.containerSpawner;
  }
}

export default ContainerServer;