/**
 * @fileoverview MCP Server implementation for ClaudeCluster
 */

import { EventEmitter } from 'events';
import Fastify, { type FastifyInstance, type FastifyRequest, type FastifyReply } from 'fastify';
import type { WebSocket } from 'ws';
import { MCPSession, type MCPToolCallRequest } from '../protocol/index.js';
import { ClaudeIntegration, type ClaudeAPIConfig } from '../claude/index.js';
import { ClaudeDriver, createDriver } from '@claudecluster/driver';
import type { Task, TaskResult, Worker } from '@claudecluster/core';
import { TaskStatus } from '@claudecluster/core';
import { MCPContainerSpawnerTool, type ContainerExecutionResult, type ContainerSpawnerParams } from '../tools/container-spawner.js';
import { pino, type Logger } from 'pino';

/**
 * MCP server configuration
 */
export interface MCPServerConfig {
  readonly host: string;
  readonly port: number;
  readonly enableWebSocket: boolean;
  readonly enableHTTP: boolean;
  readonly corsOrigin?: string | string[];
  readonly sessionTimeout: number;
  readonly enableAuthentication: boolean;
  readonly jwtSecret?: string;
  readonly claudeConfig: ClaudeAPIConfig;
  readonly driverConfig?: {
    host: string;
    port: number;
    driverId: string;
  };
}

/**
 * Default MCP server configuration
 */
export const DEFAULT_MCP_CONFIG: Omit<MCPServerConfig, 'claudeConfig'> = {
  host: '0.0.0.0',
  port: 3100,
  enableWebSocket: true,
  enableHTTP: true,
  sessionTimeout: 3600000, // 1 hour
  enableAuthentication: false,
  driverConfig: {
    host: 'localhost',
    port: 3000,
    driverId: 'mcp-driver'
  }
};

/**
 * MCP server events
 */
export interface MCPServerEvents {
  'started': () => void;
  'stopped': () => void;
  'session-created': (sessionId: string) => void;
  'session-ended': (sessionId: string) => void;
  'tool-called': (sessionId: string, toolName: string, args: any) => void;
  'task-submitted': (sessionId: string, task: Task) => void;
  'task-completed': (sessionId: string, taskId: string, result: TaskResult) => void;
  'error': (error: Error) => void;
}

/**
 * MCP Server implementation
 */
export class MCPServer extends EventEmitter {
  private readonly config: MCPServerConfig;
  private fastify: FastifyInstance;
  private claudeIntegration: ClaudeIntegration;
  private driver?: ClaudeDriver;
  private containerSpawner: MCPContainerSpawnerTool;
  private logger: Logger;
  private sessions = new Map<string, MCPSession>();
  private websocketSessions = new Map<string, WebSocket>();
  private isRunning = false;
  private cleanupInterval?: NodeJS.Timeout;

  constructor(config: Partial<MCPServerConfig> & { claudeConfig: ClaudeAPIConfig }) {
    super();
    
    this.config = { ...DEFAULT_MCP_CONFIG, ...config };
    
    // Initialize logger
    this.logger = pino({
      level: process.env.LOG_LEVEL || 'info',
      prettyPrint: process.env.NODE_ENV === 'development'
    });
    
    // Initialize Fastify
    this.fastify = Fastify({
      logger: this.logger
    });

    // Initialize Claude integration
    this.claudeIntegration = new ClaudeIntegration(this.config.claudeConfig);
    
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

    // JWT Authentication (if enabled)
    if (this.config.enableAuthentication && this.config.jwtSecret) {
      this.fastify.register(require('@fastify/jwt'), {
        secret: this.config.jwtSecret
      });
    }

    // WebSocket support
    if (this.config.enableWebSocket) {
      this.fastify.register(require('@fastify/websocket'));
      this.setupWebSocketRoutes();
    }

    // HTTP MCP endpoint
    if (this.config.enableHTTP) {
      this.fastify.post('/mcp', this.handleHTTPMCPRequest.bind(this));
    }

    // Health check
    this.fastify.get('/health', this.handleHealthCheck.bind(this));
    
    // Server info
    this.fastify.get('/info', this.handleServerInfo.bind(this));
    
    // Sessions management
    this.fastify.get('/sessions', this.handleListSessions.bind(this));
    this.fastify.delete('/sessions/:sessionId', this.handleEndSession.bind(this));

    // Driver integration endpoints
    this.fastify.get('/cluster/status', this.handleClusterStatus.bind(this));
    this.fastify.get('/cluster/workers', this.handleClusterWorkers.bind(this));
    this.fastify.get('/cluster/tasks', this.handleClusterTasks.bind(this));

    // Container spawner endpoints
    this.fastify.post('/container/spawn', this.handleSpawnContainer.bind(this));
    this.fastify.get('/container/list', this.handleListContainers.bind(this));
    this.fastify.get('/container/docker-info', this.handleDockerInfo.bind(this));

    // Error handler
    this.fastify.setErrorHandler(this.handleError.bind(this));
  }

  /**
   * Set up WebSocket routes
   */
  private setupWebSocketRoutes(): void {
    this.fastify.register(async (fastify) => {
      fastify.get('/ws', { websocket: true }, (connection, request) => {
        this.handleWebSocketConnection(connection.socket, request);
      });
    });
  }

  /**
   * Handle WebSocket connection
   */
  private async handleWebSocketConnection(socket: WebSocket, request: FastifyRequest): void {
    const sessionId = this.generateSessionId();
    const session = new MCPSession(sessionId);
    
    this.sessions.set(sessionId, session);
    this.websocketSessions.set(sessionId, socket);
    
    console.log(`MCP WebSocket session ${sessionId} connected`);
    this.emit('session-created', sessionId);

    // Set up session event handlers
    session.on('tool-call', (toolCall) => {
      this.handleToolCall(sessionId, toolCall);
    });

    // Handle incoming messages
    socket.on('message', async (data) => {
      try {
        const message = data.toString();
        const response = await session.handleMessage(message);
        
        if (response) {
          socket.send(session.sendMessage(response));
        }
      } catch (error) {
        console.error(`Error handling WebSocket message for session ${sessionId}:`, error);
        const errorMessage = session.sendNotification('error', {
          message: error instanceof Error ? error.message : String(error)
        });
        socket.send(errorMessage);
      }
    });

    // Handle connection close
    socket.on('close', () => {
      console.log(`MCP WebSocket session ${sessionId} disconnected`);
      this.cleanupSession(sessionId);
    });

    // Handle connection error
    socket.on('error', (error) => {
      console.error(`WebSocket error for session ${sessionId}:`, error);
      this.cleanupSession(sessionId);
    });
  }

  /**
   * Handle HTTP MCP request
   */
  private async handleHTTPMCPRequest(
    request: FastifyRequest<{ Body: { sessionId?: string; message: string } }>,
    reply: FastifyReply
  ): Promise<void> {
    try {
      const { sessionId: providedSessionId, message } = request.body;
      const sessionId = providedSessionId || this.generateSessionId();
      
      let session = this.sessions.get(sessionId);
      if (!session) {
        session = new MCPSession(sessionId);
        this.sessions.set(sessionId, session);
        this.emit('session-created', sessionId);
        
        // Set up session event handlers
        session.on('tool-call', (toolCall) => {
          this.handleToolCall(sessionId, toolCall);
        });
      }

      const response = await session.handleMessage(message);
      
      reply.send({
        sessionId,
        response: response ? JSON.parse(session.sendMessage(response)) : null
      });

    } catch (error) {
      console.error('Error handling HTTP MCP request:', error);
      reply.code(500).send({
        error: 'Internal server error',
        message: error instanceof Error ? error.message : String(error)
      });
    }
  }

  /**
   * Handle tool call
   */
  private async handleToolCall(sessionId: string, toolCall: MCPToolCallRequest): Promise<void> {
    this.emit('tool-called', sessionId, toolCall.name, toolCall.arguments);

    try {
      switch (toolCall.name) {
        case 'submit_parallel_task':
          await this.handleSubmitTask(sessionId, toolCall.arguments);
          break;
        
        case 'get_task_status':
          await this.handleGetTaskStatus(sessionId, toolCall.arguments);
          break;
        
        case 'list_cluster_workers':
          await this.handleListWorkers(sessionId);
          break;
        
        case 'get_cluster_stats':
          await this.handleGetClusterStats(sessionId);
          break;
        
        case 'spawn_claude_container':
          await this.handleSpawnContainerTool(sessionId, toolCall.arguments);
          break;
        
        default:
          console.warn(`Unknown tool call: ${toolCall.name}`);
      }
    } catch (error) {
      console.error(`Error handling tool call ${toolCall.name}:`, error);
    }
  }

  /**
   * Handle submit task tool call
   */
  private async handleSubmitTask(sessionId: string, args: any): Promise<void> {
    if (!this.driver) {
      throw new Error('Driver not available');
    }

    try {
      const task: Task = {
        id: this.generateTaskId(),
        title: args.title,
        description: args.description,
        category: args.category || 'coding',
        priority: args.priority || 'normal',
        status: TaskStatus.PENDING,
        dependencies: args.dependencies || [],
        context: args.context || {},
        createdAt: new Date(),
        updatedAt: new Date()
      };

      // Submit task to driver
      await this.driver.submitTask(task);
      
      // Process with Claude integration
      const claudeResult = await this.claudeIntegration.processTask(sessionId, task);
      
      // Send response back to client
      const session = this.sessions.get(sessionId);
      const websocket = this.websocketSessions.get(sessionId);
      
      if (session && websocket) {
        const notification = session.sendNotification('tool_result', {
          tool: 'submit_parallel_task',
          result: {
            taskId: task.id,
            status: 'submitted',
            claudeResponse: claudeResult.response,
            extractedFiles: claudeResult.extractedFiles,
            followUpTasks: claudeResult.followUpTasks
          }
        });
        websocket.send(notification);
      }

      this.emit('task-submitted', sessionId, task);

    } catch (error) {
      console.error('Error submitting task:', error);
      throw error;
    }
  }

  /**
   * Handle get task status tool call
   */
  private async handleGetTaskStatus(sessionId: string, args: any): Promise<void> {
    if (!this.driver) {
      throw new Error('Driver not available');
    }

    try {
      const { taskId } = args;
      const status = this.driver.getTaskStatus(taskId);
      const progress = this.driver.getTaskProgress(taskId);
      const result = this.driver.getTaskResult(taskId);

      const session = this.sessions.get(sessionId);
      const websocket = this.websocketSessions.get(sessionId);
      
      if (session && websocket) {
        const notification = session.sendNotification('tool_result', {
          tool: 'get_task_status',
          result: {
            taskId,
            status,
            progress,
            result
          }
        });
        websocket.send(notification);
      }

    } catch (error) {
      console.error('Error getting task status:', error);
      throw error;
    }
  }

  /**
   * Handle list workers tool call
   */
  private async handleListWorkers(sessionId: string): Promise<void> {
    if (!this.driver) {
      throw new Error('Driver not available');
    }

    try {
      const workers = this.driver.getWorkers();

      const session = this.sessions.get(sessionId);
      const websocket = this.websocketSessions.get(sessionId);
      
      if (session && websocket) {
        const notification = session.sendNotification('tool_result', {
          tool: 'list_cluster_workers',
          result: {
            workers: workers.map(worker => ({
              id: worker.id,
              name: worker.name,
              status: worker.status,
              capabilities: worker.capabilities,
              currentTasks: worker.currentTasks.length
            }))
          }
        });
        websocket.send(notification);
      }

    } catch (error) {
      console.error('Error listing workers:', error);
      throw error;
    }
  }

  /**
   * Handle get cluster stats tool call
   */
  private async handleGetClusterStats(sessionId: string): Promise<void> {
    if (!this.driver) {
      throw new Error('Driver not available');
    }

    try {
      const stats = this.driver.getStats();

      const session = this.sessions.get(sessionId);
      const websocket = this.websocketSessions.get(sessionId);
      
      if (session && websocket) {
        const notification = session.sendNotification('tool_result', {
          tool: 'get_cluster_stats',
          result: stats
        });
        websocket.send(notification);
      }

    } catch (error) {
      console.error('Error getting cluster stats:', error);
      throw error;
    }
  }

  /**
   * Handle spawn container tool call
   */
  private async handleSpawnContainerTool(sessionId: string, args: ContainerSpawnerParams): Promise<void> {
    this.logger.info({ sessionId, args }, 'Spawning container via tool call');

    try {
      const result = await this.containerSpawner.execute(args);
      
      const session = this.sessions.get(sessionId);
      const websocket = this.websocketSessions.get(sessionId);
      
      if (session && websocket) {
        const notification = session.sendNotification('tool_result', {
          tool: 'spawn_claude_container',
          result
        });
        websocket.send(notification);
      }

      this.logger.info({ sessionId, containerId: result.containerId }, 'Container spawned successfully');

    } catch (error) {
      this.logger.error({ sessionId, error }, 'Error spawning container');
      
      const session = this.sessions.get(sessionId);
      const websocket = this.websocketSessions.get(sessionId);
      
      if (session && websocket) {
        const errorNotification = session.sendNotification('error', {
          tool: 'spawn_claude_container',
          message: error instanceof Error ? error.message : String(error)
        });
        websocket.send(errorNotification);
      }
      
      throw error;
    }
  }

  /**
   * Handle health check
   */
  private async handleHealthCheck(
    request: FastifyRequest,
    reply: FastifyReply
  ): Promise<void> {
    const claudeStats = this.claudeIntegration.getSessionStats();
    const driverStats = this.driver ? this.driver.getStats() : null;

    reply.send({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      uptime: process.uptime() * 1000,
      sessions: {
        total: this.sessions.size,
        websocket: this.websocketSessions.size
      },
      claude: claudeStats,
      driver: driverStats ? {
        status: this.driver!.getStatus(),
        workers: driverStats.activeWorkers,
        tasks: driverStats.runningTasks
      } : null
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
      name: 'ClaudeCluster MCP Server',
      version: '0.1.0',
      protocolVersion: '2024-11-05',
      capabilities: {
        websocket: this.config.enableWebSocket,
        http: this.config.enableHTTP,
        authentication: this.config.enableAuthentication,
        containerSpawning: true,
        dockerIntegration: true
      },
      endpoints: {
        websocket: this.config.enableWebSocket ? '/ws' : null,
        http: this.config.enableHTTP ? '/mcp' : null,
        containerSpawn: '/container/spawn',
        containerList: '/container/list',
        dockerInfo: '/container/docker-info'
      },
      tools: [
        'submit_parallel_task',
        'get_task_status', 
        'list_cluster_workers',
        'get_cluster_stats',
        'spawn_claude_container'
      ]
    });
  }

  /**
   * Handle list sessions request
   */
  private async handleListSessions(
    request: FastifyRequest,
    reply: FastifyReply
  ): Promise<void> {
    const sessions = Array.from(this.sessions.entries()).map(([id, session]) => ({
      sessionId: id,
      state: session.getState(),
      hasWebSocket: this.websocketSessions.has(id)
    }));

    reply.send({ sessions });
  }

  /**
   * Handle end session request
   */
  private async handleEndSession(
    request: FastifyRequest<{ Params: { sessionId: string } }>,
    reply: FastifyReply
  ): Promise<void> {
    const { sessionId } = request.params;
    this.cleanupSession(sessionId);
    reply.send({ message: 'Session ended', sessionId });
  }

  /**
   * Handle cluster status request
   */
  private async handleClusterStatus(
    request: FastifyRequest,
    reply: FastifyReply
  ): Promise<void> {
    if (!this.driver) {
      return reply.code(503).send({ error: 'Driver not available' });
    }

    const stats = this.driver.getStats();
    reply.send({
      driver: {
        id: this.driver.id,
        status: this.driver.getStatus(),
        uptime: this.driver.getUptime()
      },
      stats
    });
  }

  /**
   * Handle cluster workers request
   */
  private async handleClusterWorkers(
    request: FastifyRequest,
    reply: FastifyReply
  ): Promise<void> {
    if (!this.driver) {
      return reply.code(503).send({ error: 'Driver not available' });
    }

    const workers = this.driver.getWorkers();
    reply.send({ workers });
  }

  /**
   * Handle cluster tasks request
   */
  private async handleClusterTasks(
    request: FastifyRequest,
    reply: FastifyReply
  ): Promise<void> {
    if (!this.driver) {
      return reply.code(503).send({ error: 'Driver not available' });
    }

    const contexts = this.driver.getExecutionContexts();
    const tasks = Array.from(contexts.entries()).map(([taskId, context]) => ({
      taskId,
      workerId: context.workerId,
      status: context.status,
      progress: context.progress,
      startTime: context.startTime
    }));

    reply.send({ tasks });
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
    console.error('Server error:', error);
    this.emit('error', error);
    
    reply.code(500).send({
      error: 'Internal server error',
      message: process.env.NODE_ENV === 'development' ? error.message : 'An internal error occurred'
    });
  }

  /**
   * Set up event handlers
   */
  private setupEventHandlers(): void {
    // Claude integration events
    this.claudeIntegration.on('error', (error, sessionId) => {
      console.error(`Claude integration error${sessionId ? ` for session ${sessionId}` : ''}:`, error);
      this.emit('error', error);
    });

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
      this.logger.info({ sessionId, result: { sessionId: result.sessionId, exitCode: result.exitCode, duration: result.duration } }, 'Container execution completed');
      this.broadcastContainerResult(sessionId, result);
    });

    // Driver events (if connected)
    if (this.driver) {
      this.driver.on('task-completed', (taskId, result) => {
        this.emit('task-completed', 'system', taskId, result);
        this.broadcastTaskUpdate(taskId, 'completed', result);
      });

      this.driver.on('task-failed', (taskId, error) => {
        this.broadcastTaskUpdate(taskId, 'failed', { error: error.message });
      });
    }
  }

  /**
   * Broadcast task update to all sessions
   */
  private broadcastTaskUpdate(taskId: string, status: string, data: any): void {
    for (const [sessionId, websocket] of this.websocketSessions) {
      const session = this.sessions.get(sessionId);
      if (session) {
        const notification = session.sendNotification('task_update', {
          taskId,
          status,
          data
        });
        websocket.send(notification);
      }
    }
  }

  /**
   * Broadcast container execution result to all sessions
   */
  private broadcastContainerResult(sessionId: string, result: ContainerExecutionResult): void {
    const websocket = this.websocketSessions.get(sessionId);
    const session = this.sessions.get(sessionId);
    
    if (session && websocket) {
      const notification = session.sendNotification('container_result', {
        sessionId: result.sessionId,
        containerId: result.containerId,
        exitCode: result.exitCode,
        duration: result.duration,
        success: result.exitCode === 0
      });
      websocket.send(notification);
    }
  }

  /**
   * Initialize driver connection
   */
  async initializeDriver(): Promise<void> {
    if (!this.config.driverConfig) {
      console.warn('No driver configuration provided, running without driver integration');
      return;
    }

    try {
      // For now, create a local driver instance
      // In production, this would connect to an existing driver
      this.driver = createDriver({
        driverId: this.config.driverConfig.driverId,
        host: this.config.driverConfig.host,
        port: this.config.driverConfig.port,
        name: 'MCP Integrated Driver'
      });

      await this.driver.start();
      console.log('Driver integration initialized');
      
    } catch (error) {
      console.error('Failed to initialize driver:', error);
      throw error;
    }
  }

  /**
   * Start the MCP server
   */
  async start(): Promise<void> {
    if (this.isRunning) return;

    try {
      // Initialize driver if configured
      if (this.config.driverConfig) {
        await this.initializeDriver();
      }

      // Start Fastify server
      await this.fastify.listen({
        host: this.config.host,
        port: this.config.port
      });

      // Start cleanup interval
      this.cleanupInterval = setInterval(() => {
        this.cleanupExpiredSessions();
      }, 60000); // Every minute

      this.isRunning = true;
      console.log(`MCP Server started on ${this.config.host}:${this.config.port}`);
      this.emit('started');

    } catch (error) {
      console.error('Failed to start MCP server:', error);
      throw error;
    }
  }

  /**
   * Stop the MCP server
   */
  async stop(): Promise<void> {
    if (!this.isRunning) return;

    try {
      // Clear cleanup interval
      if (this.cleanupInterval) {
        clearInterval(this.cleanupInterval);
        this.cleanupInterval = undefined;
      }

      // Close all WebSocket connections
      for (const websocket of this.websocketSessions.values()) {
        websocket.close();
      }

      // Stop driver
      if (this.driver) {
        await this.driver.stop();
      }

      // Cleanup container spawner
      await this.containerSpawner.cleanup();

      // Close Fastify server
      await this.fastify.close();

      this.isRunning = false;
      console.log('MCP Server stopped');
      this.emit('stopped');

    } catch (error) {
      console.error('Error stopping MCP server:', error);
      throw error;
    }
  }

  /**
   * Generate session ID
   */
  private generateSessionId(): string {
    return `mcp-session-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Generate task ID
   */
  private generateTaskId(): string {
    return `task-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Cleanup session
   */
  private cleanupSession(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    const websocket = this.websocketSessions.get(sessionId);

    if (session) {
      session.close();
      this.sessions.delete(sessionId);
    }

    if (websocket) {
      websocket.close();
      this.websocketSessions.delete(sessionId);
    }

    // End Claude session
    this.claudeIntegration.endSession(sessionId);

    this.emit('session-ended', sessionId);
  }

  /**
   * Cleanup expired sessions
   */
  private cleanupExpiredSessions(): void {
    const now = Date.now();
    const expiredSessions: string[] = [];

    for (const [sessionId] of this.sessions) {
      // For now, just check if WebSocket is still connected
      const websocket = this.websocketSessions.get(sessionId);
      if (websocket && (websocket.readyState === websocket.CLOSED || websocket.readyState === websocket.CLOSING)) {
        expiredSessions.push(sessionId);
      }
    }

    for (const sessionId of expiredSessions) {
      this.cleanupSession(sessionId);
    }

    // Cleanup old Claude sessions
    const cleanedClaude = this.claudeIntegration.cleanupSessions(this.config.sessionTimeout);
    if (cleanedClaude > 0) {
      console.log(`Cleaned up ${cleanedClaude} expired Claude sessions`);
    }
  }

  /**
   * Get server statistics
   */
  getStats(): {
    sessions: number;
    websockets: number;
    uptime: number;
    claude: ReturnType<ClaudeIntegration['getSessionStats']>;
    driver?: any;
  } {
    return {
      sessions: this.sessions.size,
      websockets: this.websocketSessions.size,
      uptime: this.isRunning ? process.uptime() * 1000 : 0,
      claude: this.claudeIntegration.getSessionStats(),
      driver: this.driver ? this.driver.getStats() : undefined
    };
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
   * Get WebSocket URL
   */
  getWebSocketUrl(): string {
    const { host, port } = this.config;
    const hostname = host === '0.0.0.0' ? 'localhost' : host;
    return `ws://${hostname}:${port}/ws`;
  }
}