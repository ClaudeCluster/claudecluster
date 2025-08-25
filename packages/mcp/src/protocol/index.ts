/**
 * @fileoverview Model Context Protocol implementation for ClaudeCluster
 */

import { EventEmitter } from 'events';
import { v4 as uuidv4 } from 'uuid';
import { request, notification, success, error, type JsonRpcMessage } from 'jsonrpc-lite';
import type { Task, TaskResult } from '@claudecluster/core';

/**
 * MCP protocol version
 */
export const MCP_VERSION = '2024-11-05';

/**
 * MCP message types
 */
export enum MCPMessageType {
  // Protocol initialization
  INITIALIZE = 'initialize',
  INITIALIZED = 'initialized',
  
  // Capabilities
  LIST_TOOLS = 'tools/list',
  CALL_TOOL = 'tools/call',
  
  // Resources
  LIST_RESOURCES = 'resources/list',
  READ_RESOURCE = 'resources/read',
  
  // Prompts
  LIST_PROMPTS = 'prompts/list',
  GET_PROMPT = 'prompts/get',
  
  // Logging
  LOG = 'notifications/message',
  
  // Progress
  PROGRESS = 'notifications/progress',
  
  // Custom ClaudeCluster methods
  SUBMIT_TASK = 'claudecluster/task/submit',
  GET_TASK_STATUS = 'claudecluster/task/status',
  CANCEL_TASK = 'claudecluster/task/cancel',
  LIST_WORKERS = 'claudecluster/workers/list',
  GET_CLUSTER_STATUS = 'claudecluster/status'
}

/**
 * MCP client capabilities
 */
export interface MCPClientCapabilities {
  experimental?: Record<string, unknown>;
  sampling?: Record<string, unknown>;
}

/**
 * MCP server capabilities
 */
export interface MCPServerCapabilities {
  logging?: Record<string, unknown>;
  prompts?: {
    listChanged?: boolean;
  };
  resources?: {
    subscribe?: boolean;
    listChanged?: boolean;
  };
  tools?: {
    listChanged?: boolean;
  };
  experimental?: Record<string, unknown>;
}

/**
 * MCP tool definition
 */
export interface MCPTool {
  name: string;
  description: string;
  inputSchema: {
    type: 'object';
    properties: Record<string, unknown>;
    required?: string[];
  };
}

/**
 * MCP resource definition
 */
export interface MCPResource {
  uri: string;
  name: string;
  description?: string;
  mimeType?: string;
}

/**
 * MCP prompt definition
 */
export interface MCPPrompt {
  name: string;
  description?: string;
  arguments?: Array<{
    name: string;
    description?: string;
    required?: boolean;
  }>;
}

/**
 * MCP initialization request
 */
export interface MCPInitializeRequest {
  protocolVersion: string;
  capabilities: MCPClientCapabilities;
  clientInfo: {
    name: string;
    version: string;
  };
}

/**
 * MCP initialization response
 */
export interface MCPInitializeResponse {
  protocolVersion: string;
  capabilities: MCPServerCapabilities;
  serverInfo: {
    name: string;
    version: string;
  };
}

/**
 * MCP tool call request
 */
export interface MCPToolCallRequest {
  name: string;
  arguments?: Record<string, unknown>;
}

/**
 * MCP tool call response
 */
export interface MCPToolCallResponse {
  content: Array<{
    type: 'text' | 'image' | 'resource';
    text?: string;
    data?: string;
    mimeType?: string;
  }>;
  isError?: boolean;
}

/**
 * MCP session events
 */
export interface MCPSessionEvents {
  'initialized': () => void;
  'message': (message: JsonRpcMessage) => void;
  'tool-call': (request: MCPToolCallRequest) => void;
  'error': (error: Error) => void;
  'closed': () => void;
}

/**
 * MCP session state
 */
export enum MCPSessionState {
  CONNECTING = 'connecting',
  INITIALIZING = 'initializing',
  READY = 'ready',
  ERROR = 'error',
  CLOSED = 'closed'
}

/**
 * MCP session implementation
 */
export class MCPSession extends EventEmitter {
  private sessionId: string;
  private state: MCPSessionState = MCPSessionState.CONNECTING;
  private clientInfo?: { name: string; version: string };
  private capabilities?: MCPClientCapabilities;
  private messageQueue: JsonRpcMessage[] = [];

  constructor(sessionId?: string) {
    super();
    this.sessionId = sessionId || uuidv4();
  }

  /**
   * Get session ID
   */
  getId(): string {
    return this.sessionId;
  }

  /**
   * Get session state
   */
  getState(): MCPSessionState {
    return this.state;
  }

  /**
   * Handle incoming MCP message
   */
  async handleMessage(rawMessage: string): Promise<JsonRpcMessage | null> {
    try {
      const parsed = JSON.parse(rawMessage);
      const message = this.parseJsonRpcMessage(parsed);
      
      this.emit('message', message);
      
      if (message.type === 'request') {
        return await this.handleRequest(message);
      } else if (message.type === 'notification') {
        await this.handleNotification(message);
        return null;
      }
      
      return null;
    } catch (error) {
      console.error('Failed to handle MCP message:', error);
      return error({
        code: -32700,
        message: 'Parse error'
      });
    }
  }

  /**
   * Parse JSON-RPC message
   */
  private parseJsonRpcMessage(data: any): JsonRpcMessage {
    if (data.method) {
      if (data.id !== undefined) {
        return request(data.id, data.method, data.params);
      } else {
        return notification(data.method, data.params);
      }
    } else if (data.result !== undefined) {
      return success(data.id, data.result);
    } else if (data.error !== undefined) {
      return error(data.id, data.error);
    }
    
    throw new Error('Invalid JSON-RPC message');
  }

  /**
   * Handle MCP request
   */
  private async handleRequest(message: JsonRpcMessage): Promise<JsonRpcMessage> {
    if (message.type !== 'request') {
      return error(null, { code: -32600, message: 'Invalid request' });
    }

    const { method, params, id } = message.payload;

    try {
      switch (method) {
        case MCPMessageType.INITIALIZE:
          return await this.handleInitialize(id, params as MCPInitializeRequest);
        
        case MCPMessageType.LIST_TOOLS:
          return await this.handleListTools(id);
        
        case MCPMessageType.CALL_TOOL:
          return await this.handleToolCall(id, params as MCPToolCallRequest);
        
        case MCPMessageType.LIST_RESOURCES:
          return await this.handleListResources(id);
        
        case MCPMessageType.READ_RESOURCE:
          return await this.handleReadResource(id, params);
        
        case MCPMessageType.LIST_PROMPTS:
          return await this.handleListPrompts(id);
        
        case MCPMessageType.GET_PROMPT:
          return await this.handleGetPrompt(id, params);

        // ClaudeCluster custom methods
        case MCPMessageType.SUBMIT_TASK:
          return await this.handleSubmitTask(id, params);
        
        case MCPMessageType.GET_TASK_STATUS:
          return await this.handleGetTaskStatus(id, params);
        
        case MCPMessageType.CANCEL_TASK:
          return await this.handleCancelTask(id, params);
        
        case MCPMessageType.LIST_WORKERS:
          return await this.handleListWorkers(id);
        
        case MCPMessageType.GET_CLUSTER_STATUS:
          return await this.handleGetClusterStatus(id);
        
        default:
          return error(id, { code: -32601, message: 'Method not found' });
      }
    } catch (err) {
      console.error(`Error handling MCP request ${method}:`, err);
      return error(id, {
        code: -32603,
        message: 'Internal error',
        data: err instanceof Error ? err.message : String(err)
      });
    }
  }

  /**
   * Handle MCP notification
   */
  private async handleNotification(message: JsonRpcMessage): Promise<void> {
    if (message.type !== 'notification') return;

    const { method, params } = message.payload;

    switch (method) {
      case MCPMessageType.INITIALIZED:
        this.state = MCPSessionState.READY;
        this.emit('initialized');
        break;
      
      case MCPMessageType.LOG:
        // Handle logging notification
        console.log('MCP Log:', params);
        break;
      
      case MCPMessageType.PROGRESS:
        // Handle progress notification
        this.emit('progress', params);
        break;
    }
  }

  /**
   * Handle initialize request
   */
  private async handleInitialize(id: any, params: MCPInitializeRequest): Promise<JsonRpcMessage> {
    this.clientInfo = params.clientInfo;
    this.capabilities = params.capabilities;
    this.state = MCPSessionState.INITIALIZING;

    const response: MCPInitializeResponse = {
      protocolVersion: MCP_VERSION,
      capabilities: {
        logging: {},
        tools: { listChanged: true },
        resources: { listChanged: true },
        prompts: { listChanged: true },
        experimental: {}
      },
      serverInfo: {
        name: 'ClaudeCluster MCP Server',
        version: '0.1.0'
      }
    };

    return success(id, response);
  }

  /**
   * Handle list tools request
   */
  private async handleListTools(id: any): Promise<JsonRpcMessage> {
    const tools: MCPTool[] = [
      {
        name: 'submit_parallel_task',
        description: 'Submit a task for parallel execution across ClaudeCluster workers',
        inputSchema: {
          type: 'object',
          properties: {
            title: { type: 'string', description: 'Task title' },
            description: { type: 'string', description: 'Task description' },
            category: { 
              type: 'string', 
              enum: ['coding', 'analysis', 'refactoring', 'testing', 'documentation'],
              description: 'Task category'
            },
            priority: {
              type: 'string',
              enum: ['critical', 'high', 'normal', 'low', 'background'],
              description: 'Task priority'
            },
            dependencies: { 
              type: 'array', 
              items: { type: 'string' },
              description: 'Array of task IDs this task depends on'
            },
            context: { type: 'object', description: 'Additional context for the task' }
          },
          required: ['title', 'description', 'category']
        }
      },
      {
        name: 'get_task_status',
        description: 'Get the status and progress of a submitted task',
        inputSchema: {
          type: 'object',
          properties: {
            taskId: { type: 'string', description: 'Task ID to check status for' }
          },
          required: ['taskId']
        }
      },
      {
        name: 'list_cluster_workers',
        description: 'List all available workers in the ClaudeCluster',
        inputSchema: {
          type: 'object',
          properties: {}
        }
      },
      {
        name: 'get_cluster_stats',
        description: 'Get comprehensive statistics about the ClaudeCluster performance',
        inputSchema: {
          type: 'object',
          properties: {}
        }
      }
    ];

    return success(id, { tools });
  }

  /**
   * Handle tool call request
   */
  private async handleToolCall(id: any, params: MCPToolCallRequest): Promise<JsonRpcMessage> {
    this.emit('tool-call', params);
    
    // This will be handled by the MCP server implementation
    // For now, return a placeholder response
    const response: MCPToolCallResponse = {
      content: [{
        type: 'text',
        text: `Tool ${params.name} called with arguments: ${JSON.stringify(params.arguments)}`
      }]
    };

    return success(id, response);
  }

  /**
   * Handle list resources request
   */
  private async handleListResources(id: any): Promise<JsonRpcMessage> {
    const resources: MCPResource[] = [
      {
        uri: 'claudecluster://tasks',
        name: 'Active Tasks',
        description: 'List of currently active tasks in the cluster',
        mimeType: 'application/json'
      },
      {
        uri: 'claudecluster://workers',
        name: 'Cluster Workers',
        description: 'Information about all registered workers',
        mimeType: 'application/json'
      },
      {
        uri: 'claudecluster://stats',
        name: 'Cluster Statistics',
        description: 'Performance and usage statistics',
        mimeType: 'application/json'
      }
    ];

    return success(id, { resources });
  }

  /**
   * Handle read resource request
   */
  private async handleReadResource(id: any, params: any): Promise<JsonRpcMessage> {
    // This will be implemented by the MCP server
    return success(id, { 
      contents: [{
        uri: params.uri,
        mimeType: 'application/json',
        text: JSON.stringify({ message: 'Resource content will be provided by MCP server' })
      }]
    });
  }

  /**
   * Handle list prompts request
   */
  private async handleListPrompts(id: any): Promise<JsonRpcMessage> {
    const prompts: MCPPrompt[] = [
      {
        name: 'parallel_code_review',
        description: 'Perform parallel code review across multiple files',
        arguments: [
          { name: 'files', description: 'List of files to review', required: true },
          { name: 'focus', description: 'Review focus areas', required: false }
        ]
      },
      {
        name: 'distributed_refactoring',
        description: 'Perform distributed refactoring across codebase',
        arguments: [
          { name: 'scope', description: 'Refactoring scope', required: true },
          { name: 'strategy', description: 'Refactoring strategy', required: false }
        ]
      }
    ];

    return success(id, { prompts });
  }

  /**
   * Handle get prompt request
   */
  private async handleGetPrompt(id: any, params: any): Promise<JsonRpcMessage> {
    // This will be implemented by the MCP server
    return success(id, { 
      messages: [{
        role: 'user',
        content: { type: 'text', text: 'Prompt content will be provided by MCP server' }
      }]
    });
  }

  /**
   * Handle submit task request (ClaudeCluster custom)
   */
  private async handleSubmitTask(id: any, params: any): Promise<JsonRpcMessage> {
    // This will be handled by the MCP server implementation
    return success(id, { taskId: uuidv4(), status: 'submitted' });
  }

  /**
   * Handle get task status request (ClaudeCluster custom)
   */
  private async handleGetTaskStatus(id: any, params: any): Promise<JsonRpcMessage> {
    // This will be handled by the MCP server implementation
    return success(id, { taskId: params.taskId, status: 'unknown' });
  }

  /**
   * Handle cancel task request (ClaudeCluster custom)
   */
  private async handleCancelTask(id: any, params: any): Promise<JsonRpcMessage> {
    // This will be handled by the MCP server implementation
    return success(id, { taskId: params.taskId, cancelled: true });
  }

  /**
   * Handle list workers request (ClaudeCluster custom)
   */
  private async handleListWorkers(id: any): Promise<JsonRpcMessage> {
    // This will be handled by the MCP server implementation
    return success(id, { workers: [] });
  }

  /**
   * Handle get cluster status request (ClaudeCluster custom)
   */
  private async handleGetClusterStatus(id: any): Promise<JsonRpcMessage> {
    // This will be handled by the MCP server implementation
    return success(id, { 
      status: 'running',
      totalWorkers: 0,
      activeTasks: 0,
      uptime: 0
    });
  }

  /**
   * Send message to client
   */
  sendMessage(message: JsonRpcMessage): string {
    return JSON.stringify(message.serialize());
  }

  /**
   * Send notification to client
   */
  sendNotification(method: string, params?: any): string {
    const message = notification(method, params);
    return this.sendMessage(message);
  }

  /**
   * Send progress notification
   */
  sendProgress(progressToken: string, progress: number, total?: number): string {
    return this.sendNotification(MCPMessageType.PROGRESS, {
      progressToken,
      progress,
      total
    });
  }

  /**
   * Send log notification
   */
  sendLog(level: 'debug' | 'info' | 'warning' | 'error', data: any, logger?: string): string {
    return this.sendNotification(MCPMessageType.LOG, {
      level,
      data,
      logger
    });
  }

  /**
   * Close session
   */
  close(): void {
    this.state = MCPSessionState.CLOSED;
    this.emit('closed');
  }
}