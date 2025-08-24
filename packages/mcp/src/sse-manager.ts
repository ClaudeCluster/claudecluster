import { FastifyRequest, FastifyReply } from 'fastify';
import { logger } from './logger';
import { TaskManager } from './task-manager';
import { WorkerRegistry } from './worker-registry';
import axios from 'axios';

interface SSEConnection {
  taskId: string;
  reply: FastifyReply;
  clientId: string;
  connected: boolean;
  startTime: Date;
}

export class SSEManager {
  private connections: Map<string, SSEConnection[]> = new Map();
  private taskManager: TaskManager;
  private workerRegistry: WorkerRegistry;

  constructor(taskManager: TaskManager, workerRegistry: WorkerRegistry) {
    this.taskManager = taskManager;
    this.workerRegistry = workerRegistry;
  }

  /**
   * Handle new SSE connection for a task
   */
  async handleConnection(taskId: string, request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const clientId = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    logger.info(`New SSE connection for task ${taskId}`, { clientId });

    // Set up SSE headers
    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Cache-Control',
      'X-Accel-Buffering': 'no' // Disable nginx buffering
    });

    const connection: SSEConnection = {
      taskId,
      reply,
      clientId,
      connected: true,
      startTime: new Date()
    };

    // Add connection to the map
    if (!this.connections.has(taskId)) {
      this.connections.set(taskId, []);
    }
    this.connections.get(taskId)!.push(connection);

    // Send initial status
    const task = await this.taskManager.getTask(taskId);
    if (task) {
      this.sendEvent(connection, 'status', {
        taskId,
        status: task.status,
        timestamp: new Date().toISOString()
      });
    } else {
      this.sendEvent(connection, 'error', {
        taskId,
        error: 'Task not found',
        timestamp: new Date().toISOString()
      });
      this.closeConnection(connection);
      return;
    }

    // Set up periodic heartbeat
    const heartbeat = setInterval(() => {
      if (connection.connected) {
        this.sendEvent(connection, 'heartbeat', {
          timestamp: new Date().toISOString(),
          uptime: Date.now() - connection.startTime.getTime()
        });
      } else {
        clearInterval(heartbeat);
      }
    }, 30000);

    // Handle client disconnect
    request.raw.on('close', () => {
      logger.info(`SSE connection closed for task ${taskId}`, { clientId });
      connection.connected = false;
      clearInterval(heartbeat);
      this.removeConnection(taskId, clientId);
    });

    request.raw.on('error', (error) => {
      logger.error(`SSE connection error for task ${taskId}:`, error);
      connection.connected = false;
      clearInterval(heartbeat);
      this.removeConnection(taskId, clientId);
    });

    // Start proxying from worker if task is running
    if (task && task.status === 'running' && task.assignedWorker) {
      await this.startWorkerProxy(connection, task.assignedWorker);
    }
  }

  /**
   * Start proxying SSE events from the worker
   */
  private async startWorkerProxy(connection: SSEConnection, workerEndpoint: string): Promise<void> {
    const { taskId } = connection;
    
    try {
      logger.debug(`Starting worker SSE proxy for task ${taskId}`, { workerEndpoint });

      // Create a connection to the worker's SSE stream
      // Note: This assumes the worker has an SSE endpoint - will be implemented in worker
      const workerStreamUrl = `${workerEndpoint}/stream/${taskId}`;
      
      const response = await axios.get(workerStreamUrl, {
        responseType: 'stream',
        timeout: 0, // No timeout for streaming
        headers: {
          'Accept': 'text/event-stream',
          'Cache-Control': 'no-cache'
        }
      });

      // Parse and forward SSE events from worker
      let buffer = '';
      response.data.on('data', (chunk: Buffer) => {
        buffer += chunk.toString();
        
        // Process complete SSE events
        const lines = buffer.split('\n');
        buffer = lines.pop() || ''; // Keep incomplete line in buffer
        
        let event: { type?: string; data?: string; id?: string } = {};
        
        for (const line of lines) {
          if (line.startsWith('event:')) {
            event.type = line.substring(6).trim();
          } else if (line.startsWith('data:')) {
            event.data = line.substring(5).trim();
          } else if (line.startsWith('id:')) {
            event.id = line.substring(3).trim();
          } else if (line === '' && event.type) {
            // Complete event, forward to client
            this.forwardWorkerEvent(connection, event);
            event = {};
          }
        }
      });

      response.data.on('end', () => {
        logger.info(`Worker SSE stream ended for task ${taskId}`);
        this.sendEvent(connection, 'status', {
          taskId,
          status: 'stream_ended',
          timestamp: new Date().toISOString()
        });
      });

      response.data.on('error', (error: Error) => {
        logger.error(`Worker SSE stream error for task ${taskId}:`, error);
        this.sendEvent(connection, 'error', {
          taskId,
          error: 'Worker stream error',
          details: error.message,
          timestamp: new Date().toISOString()
        });
      });

    } catch (error) {
      logger.error(`Failed to connect to worker SSE stream for task ${taskId}:`, error);
      this.sendEvent(connection, 'error', {
        taskId,
        error: 'Failed to connect to worker stream',
        details: error instanceof Error ? error.message : String(error),
        timestamp: new Date().toISOString()
      });
    }
  }

  /**
   * Forward SSE event from worker to client
   */
  private forwardWorkerEvent(connection: SSEConnection, event: { type?: string; data?: string; id?: string }): void {
    if (!connection.connected || !event.type || !event.data) return;

    try {
      // Parse worker data and add MCP context
      const workerData = JSON.parse(event.data);
      const mcpData = {
        ...workerData,
        source: 'worker',
        mcpTimestamp: new Date().toISOString(),
        relayedBy: 'mcp-server'
      };

      this.sendEvent(connection, event.type, mcpData, event.id);
      
      logger.debug(`Forwarded worker event for task ${connection.taskId}`, {
        eventType: event.type,
        clientId: connection.clientId
      });

    } catch (error) {
      logger.warn(`Failed to parse worker SSE data for task ${connection.taskId}:`, error);
      // Forward as-is if parsing fails
      this.sendRawEvent(connection, event.type, event.data || '', event.id);
    }
  }

  /**
   * Send SSE event to client
   */
  private sendEvent(connection: SSEConnection, eventType: string, data: any, id?: string): void {
    if (!connection.connected) return;

    try {
      let sseData = `event: ${eventType}\n`;
      if (id) {
        sseData += `id: ${id}\n`;
      }
      sseData += `data: ${JSON.stringify(data)}\n\n`;

      connection.reply.raw.write(sseData);
    } catch (error) {
      logger.error(`Failed to send SSE event to client ${connection.clientId}:`, error);
      connection.connected = false;
    }
  }

  /**
   * Send raw SSE event to client (for forwarding unparseable data)
   */
  private sendRawEvent(connection: SSEConnection, eventType: string, rawData: string, id?: string): void {
    if (!connection.connected) return;

    try {
      let sseData = `event: ${eventType}\n`;
      if (id) {
        sseData += `id: ${id}\n`;
      }
      sseData += `data: ${rawData}\n\n`;

      connection.reply.raw.write(sseData);
    } catch (error) {
      logger.error(`Failed to send raw SSE event to client ${connection.clientId}:`, error);
      connection.connected = false;
    }
  }

  /**
   * Broadcast event to all clients connected to a task
   */
  async broadcastToTask(taskId: string, eventType: string, data: any): Promise<void> {
    const connections = this.connections.get(taskId) || [];
    
    logger.debug(`Broadcasting event to ${connections.length} clients for task ${taskId}`, {
      eventType
    });

    for (const connection of connections) {
      this.sendEvent(connection, eventType, data);
    }
  }

  /**
   * Close a specific connection
   */
  private closeConnection(connection: SSEConnection): void {
    if (connection.connected) {
      try {
        connection.reply.raw.end();
      } catch (error) {
        logger.warn(`Error closing SSE connection:`, error);
      }
      connection.connected = false;
    }
  }

  /**
   * Remove connection from tracking
   */
  private removeConnection(taskId: string, clientId: string): void {
    const connections = this.connections.get(taskId);
    if (connections) {
      const index = connections.findIndex(conn => conn.clientId === clientId);
      if (index !== -1) {
        connections.splice(index, 1);
        if (connections.length === 0) {
          this.connections.delete(taskId);
        }
      }
    }
  }

  /**
   * Close all connections for a task (when task completes)
   */
  async closeTaskConnections(taskId: string): Promise<void> {
    const connections = this.connections.get(taskId) || [];
    
    logger.info(`Closing ${connections.length} SSE connections for completed task ${taskId}`);

    for (const connection of connections) {
      this.sendEvent(connection, 'complete', {
        taskId,
        message: 'Task completed, closing connection',
        timestamp: new Date().toISOString()
      });
      
      setTimeout(() => {
        this.closeConnection(connection);
      }, 1000); // Give client time to process final event
    }

    // Clean up after a delay
    setTimeout(() => {
      this.connections.delete(taskId);
    }, 5000);
  }

  /**
   * Get connection statistics
   */
  getStats(): {
    totalConnections: number;
    activeTasks: number;
    connectionsPerTask: Record<string, number>;
  } {
    let totalConnections = 0;
    const connectionsPerTask: Record<string, number> = {};

    for (const [taskId, connections] of this.connections.entries()) {
      const activeConnections = connections.filter(conn => conn.connected).length;
      connectionsPerTask[taskId] = activeConnections;
      totalConnections += activeConnections;
    }

    return {
      totalConnections,
      activeTasks: this.connections.size,
      connectionsPerTask
    };
  }

  /**
   * Cleanup all connections (for server shutdown)
   */
  async cleanup(): Promise<void> {
    logger.info('Closing all SSE connections for server shutdown');

    for (const [taskId, connections] of this.connections.entries()) {
      for (const connection of connections) {
        this.sendEvent(connection, 'server_shutdown', {
          message: 'Server is shutting down',
          timestamp: new Date().toISOString()
        });
        this.closeConnection(connection);
      }
    }

    this.connections.clear();
  }
}