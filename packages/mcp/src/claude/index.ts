/**
 * @fileoverview Claude API integration for ClaudeCluster MCP Server
 */

import axios, { type AxiosInstance } from 'axios';
import { EventEmitter } from 'events';
import type { Task } from '@claudecluster/core';

/**
 * Claude API configuration
 */
export interface ClaudeAPIConfig {
  readonly apiKey: string;
  readonly apiUrl?: string;
  readonly model?: string;
  readonly maxTokens?: number;
  readonly temperature?: number;
  readonly timeout?: number;
  readonly retryAttempts?: number;
  readonly retryDelay?: number;
}

/**
 * Default Claude API configuration
 */
export const DEFAULT_CLAUDE_CONFIG: Omit<ClaudeAPIConfig, 'apiKey'> = {
  apiUrl: 'https://api.anthropic.com/v1',
  model: 'claude-3-5-sonnet-20241022',
  maxTokens: 8192,
  temperature: 0,
  timeout: 60000,
  retryAttempts: 3,
  retryDelay: 1000
};

/**
 * Claude message format
 */
export interface ClaudeMessage {
  role: 'user' | 'assistant';
  content: string | Array<{
    type: 'text' | 'image';
    text?: string;
    source?: {
      type: 'base64';
      media_type: string;
      data: string;
    };
  }>;
}

/**
 * Claude API request
 */
export interface ClaudeAPIRequest {
  model: string;
  max_tokens: number;
  temperature: number;
  messages: ClaudeMessage[];
  system?: string;
  tools?: Array<{
    name: string;
    description: string;
    input_schema: Record<string, unknown>;
  }>;
  tool_choice?: 'auto' | 'any' | { type: 'tool'; name: string };
}

/**
 * Claude API response
 */
export interface ClaudeAPIResponse {
  id: string;
  type: 'message';
  role: 'assistant';
  content: Array<{
    type: 'text' | 'tool_use';
    text?: string;
    id?: string;
    name?: string;
    input?: Record<string, unknown>;
  }>;
  model: string;
  stop_reason: 'end_turn' | 'max_tokens' | 'stop_sequence' | 'tool_use';
  stop_sequence?: string;
  usage: {
    input_tokens: number;
    output_tokens: number;
  };
}

/**
 * Claude session state
 */
export interface ClaudeSession {
  readonly sessionId: string;
  readonly messages: ClaudeMessage[];
  readonly context: Record<string, unknown>;
  readonly createdAt: Date;
  readonly lastActivity: Date;
}

/**
 * Claude integration events
 */
export interface ClaudeIntegrationEvents {
  'session-created': (sessionId: string) => void;
  'session-ended': (sessionId: string) => void;
  'message-sent': (sessionId: string, message: ClaudeMessage) => void;
  'message-received': (sessionId: string, response: ClaudeAPIResponse) => void;
  'error': (error: Error, sessionId?: string) => void;
  'rate-limit': (retryAfter: number) => void;
}

/**
 * Claude API integration
 */
export class ClaudeIntegration extends EventEmitter {
  private readonly config: ClaudeAPIConfig;
  private readonly httpClient: AxiosInstance;
  private readonly sessions = new Map<string, ClaudeSession>();
  private requestCount = 0;
  private lastRequestTime = 0;

  constructor(config: ClaudeAPIConfig) {
    super();
    
    this.config = { ...DEFAULT_CLAUDE_CONFIG, ...config };
    
    // Initialize HTTP client
    this.httpClient = axios.create({
      baseURL: this.config.apiUrl,
      timeout: this.config.timeout,
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.config.apiKey,
        'anthropic-version': '2023-06-01'
      }
    });

    // Set up request/response interceptors
    this.setupInterceptors();
  }

  /**
   * Set up HTTP interceptors
   */
  private setupInterceptors(): void {
    // Request interceptor for rate limiting
    this.httpClient.interceptors.request.use((config) => {
      const now = Date.now();
      this.requestCount++;
      
      // Simple rate limiting (adjust based on Claude API limits)
      const timeSinceLastRequest = now - this.lastRequestTime;
      if (timeSinceLastRequest < 100) { // Min 100ms between requests
        return new Promise(resolve => {
          setTimeout(() => resolve(config), 100 - timeSinceLastRequest);
        });
      }
      
      this.lastRequestTime = now;
      return config;
    });

    // Response interceptor for error handling
    this.httpClient.interceptors.response.use(
      (response) => response,
      (error) => {
        if (error.response?.status === 429) {
          const retryAfter = parseInt(error.response.headers['retry-after'] || '60', 10);
          this.emit('rate-limit', retryAfter);
        }
        return Promise.reject(error);
      }
    );
  }

  /**
   * Create a new Claude session
   */
  createSession(sessionId: string, context?: Record<string, unknown>): ClaudeSession {
    const session: ClaudeSession = {
      sessionId,
      messages: [],
      context: context || {},
      createdAt: new Date(),
      lastActivity: new Date()
    };

    this.sessions.set(sessionId, session);
    this.emit('session-created', sessionId);
    
    return session;
  }

  /**
   * Get existing session
   */
  getSession(sessionId: string): ClaudeSession | undefined {
    return this.sessions.get(sessionId);
  }

  /**
   * End a Claude session
   */
  endSession(sessionId: string): void {
    this.sessions.delete(sessionId);
    this.emit('session-ended', sessionId);
  }

  /**
   * Send message to Claude API
   */
  async sendMessage(
    sessionId: string,
    message: string | ClaudeMessage,
    options?: {
      system?: string;
      tools?: Array<{
        name: string;
        description: string;
        input_schema: Record<string, unknown>;
      }>;
      toolChoice?: 'auto' | 'any' | { type: 'tool'; name: string };
    }
  ): Promise<ClaudeAPIResponse> {
    let session = this.sessions.get(sessionId);
    if (!session) {
      session = this.createSession(sessionId);
    }

    // Convert string to message format
    const claudeMessage: ClaudeMessage = typeof message === 'string'
      ? { role: 'user', content: message }
      : message;

    // Add message to session
    session.messages.push(claudeMessage);
    (session as any).lastActivity = new Date();

    this.emit('message-sent', sessionId, claudeMessage);

    try {
      // Prepare API request
      const request: ClaudeAPIRequest = {
        model: this.config.model!,
        max_tokens: this.config.maxTokens!,
        temperature: this.config.temperature!,
        messages: session.messages,
        system: options?.system,
        tools: options?.tools,
        tool_choice: options?.toolChoice
      };

      // Make API call with retry logic
      const response = await this.makeRequestWithRetry(request);
      
      // Add response to session
      const assistantMessage: ClaudeMessage = {
        role: 'assistant',
        content: this.extractContentFromResponse(response)
      };
      session.messages.push(assistantMessage);

      this.emit('message-received', sessionId, response);
      return response;

    } catch (error) {
      this.emit('error', error instanceof Error ? error : new Error(String(error)), sessionId);
      throw error;
    }
  }

  /**
   * Convert task to Claude message
   */
  taskToMessage(task: Task): ClaudeMessage {
    const context = task.context || {};
    
    let content = `Task: ${task.title}\n\n`;
    content += `Description: ${task.description}\n\n`;
    content += `Category: ${task.category}\n`;
    content += `Priority: ${task.priority}\n`;
    
    if (task.dependencies.length > 0) {
      content += `Dependencies: ${task.dependencies.join(', ')}\n`;
    }
    
    if (Object.keys(context).length > 0) {
      content += `\nContext:\n${JSON.stringify(context, null, 2)}\n`;
    }

    return {
      role: 'user',
      content
    };
  }

  /**
   * Process task with Claude
   */
  async processTask(sessionId: string, task: Task): Promise<{
    response: ClaudeAPIResponse;
    extractedCode?: string;
    extractedFiles?: Array<{ path: string; content: string }>;
    followUpTasks?: Task[];
  }> {
    // Create system prompt for task processing
    const systemPrompt = this.createSystemPrompt(task);
    
    // Convert task to message
    const message = this.taskToMessage(task);
    
    // Define tools for task processing
    const tools = this.createTaskProcessingTools();
    
    try {
      const response = await this.sendMessage(sessionId, message, {
        system: systemPrompt,
        tools,
        toolChoice: 'auto'
      });

      // Extract structured information from response
      const result = this.extractTaskResult(response, task);
      
      return {
        response,
        ...result
      };

    } catch (error) {
      throw new Error(`Failed to process task ${task.id}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Create system prompt for task processing
   */
  private createSystemPrompt(task: Task): string {
    return `You are Claude Code running in a distributed ClaudeCluster environment. You are processing a ${task.category} task with ${task.priority} priority.

Your role is to:
1. Analyze the task requirements thoroughly
2. Break down complex tasks into smaller subtasks if beneficial
3. Generate high-quality code, documentation, or analysis as requested
4. Provide clear explanations of your approach and reasoning
5. Use the available tools to structure your output properly

Focus on:
- Code quality and best practices
- Clear documentation and comments
- Proper error handling
- Security considerations
- Performance optimization where relevant

If this task would benefit from parallel processing, suggest how it could be decomposed into subtasks.`;
  }

  /**
   * Create tools for task processing
   */
  private createTaskProcessingTools(): Array<{
    name: string;
    description: string;
    input_schema: Record<string, unknown>;
  }> {
    return [
      {
        name: 'create_file',
        description: 'Create or update a file with specified content',
        input_schema: {
          type: 'object',
          properties: {
            path: { type: 'string', description: 'File path' },
            content: { type: 'string', description: 'File content' },
            language: { type: 'string', description: 'Programming language' }
          },
          required: ['path', 'content']
        }
      },
      {
        name: 'suggest_subtasks',
        description: 'Suggest breaking down the current task into subtasks',
        input_schema: {
          type: 'object',
          properties: {
            subtasks: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  title: { type: 'string' },
                  description: { type: 'string' },
                  category: { type: 'string' },
                  dependencies: { type: 'array', items: { type: 'string' } }
                },
                required: ['title', 'description', 'category']
              }
            },
            reasoning: { type: 'string', description: 'Why these subtasks are beneficial' }
          },
          required: ['subtasks', 'reasoning']
        }
      },
      {
        name: 'provide_analysis',
        description: 'Provide structured analysis or documentation',
        input_schema: {
          type: 'object',
          properties: {
            type: { 
              type: 'string', 
              enum: ['code_analysis', 'architecture_review', 'security_audit', 'performance_analysis', 'documentation']
            },
            findings: { type: 'array', items: { type: 'string' } },
            recommendations: { type: 'array', items: { type: 'string' } },
            summary: { type: 'string' }
          },
          required: ['type', 'summary']
        }
      }
    ];
  }

  /**
   * Extract task result from Claude response
   */
  private extractTaskResult(response: ClaudeAPIResponse, task: Task): {
    extractedCode?: string;
    extractedFiles?: Array<{ path: string; content: string }>;
    followUpTasks?: Task[];
  } {
    const result: {
      extractedCode?: string;
      extractedFiles?: Array<{ path: string; content: string }>;
      followUpTasks?: Task[];
    } = {};

    // Extract tool uses from response
    const toolUses = response.content.filter(item => item.type === 'tool_use');
    
    for (const toolUse of toolUses) {
      if (toolUse.name === 'create_file' && toolUse.input) {
        if (!result.extractedFiles) result.extractedFiles = [];
        result.extractedFiles.push({
          path: (toolUse.input as any).path,
          content: (toolUse.input as any).content
        });
      } else if (toolUse.name === 'suggest_subtasks' && toolUse.input) {
        const subtaskData = toolUse.input as any;
        if (subtaskData.subtasks) {
          result.followUpTasks = subtaskData.subtasks.map((subtask: any, index: number) => ({
            id: `${task.id}-subtask-${index + 1}`,
            title: subtask.title,
            description: subtask.description,
            category: subtask.category,
            priority: task.priority,
            status: 'pending' as any,
            dependencies: subtask.dependencies || [],
            context: {
              parentTask: task.id,
              subtaskIndex: index,
              reasoning: subtaskData.reasoning
            },
            createdAt: new Date(),
            updatedAt: new Date()
          }));
        }
      }
    }

    // Extract code from text content
    const textContent = response.content
      .filter(item => item.type === 'text')
      .map(item => item.text)
      .join('\n');

    // Simple code extraction (can be enhanced)
    const codeBlocks = textContent.match(/```[\s\S]*?```/g);
    if (codeBlocks) {
      result.extractedCode = codeBlocks.join('\n\n');
    }

    return result;
  }

  /**
   * Extract content from Claude response
   */
  private extractContentFromResponse(response: ClaudeAPIResponse): string {
    return response.content
      .filter(item => item.type === 'text')
      .map(item => item.text)
      .join('\n');
  }

  /**
   * Make API request with retry logic
   */
  private async makeRequestWithRetry(request: ClaudeAPIRequest): Promise<ClaudeAPIResponse> {
    let lastError: Error;
    
    for (let attempt = 0; attempt < this.config.retryAttempts!; attempt++) {
      try {
        const response = await this.httpClient.post('/messages', request);
        return response.data;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        
        // Don't retry on certain errors
        if (axios.isAxiosError(error)) {
          const status = error.response?.status;
          if (status === 400 || status === 401 || status === 403) {
            throw lastError;
          }
          
          // Handle rate limiting
          if (status === 429) {
            const retryAfter = parseInt(error.response?.headers['retry-after'] || '60', 10);
            await new Promise(resolve => setTimeout(resolve, retryAfter * 1000));
            continue;
          }
        }
        
        // Wait before retry
        if (attempt < this.config.retryAttempts! - 1) {
          await new Promise(resolve => 
            setTimeout(resolve, this.config.retryDelay! * Math.pow(2, attempt))
          );
        }
      }
    }
    
    throw lastError!;
  }

  /**
   * Get session statistics
   */
  getSessionStats(): {
    totalSessions: number;
    activeSessions: number;
    totalMessages: number;
    totalRequests: number;
  } {
    const activeSessions = Array.from(this.sessions.values());
    const totalMessages = activeSessions.reduce((sum, session) => sum + session.messages.length, 0);
    
    return {
      totalSessions: this.sessions.size,
      activeSessions: activeSessions.length,
      totalMessages,
      totalRequests: this.requestCount
    };
  }

  /**
   * Clean up old sessions
   */
  cleanupSessions(maxAge: number = 3600000): number { // 1 hour default
    const now = Date.now();
    let cleaned = 0;
    
    for (const [sessionId, session] of this.sessions) {
      if (now - session.lastActivity.getTime() > maxAge) {
        this.endSession(sessionId);
        cleaned++;
      }
    }
    
    return cleaned;
  }
}