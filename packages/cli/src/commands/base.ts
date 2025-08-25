/**
 * @fileoverview Base command class and common functionality
 */

import { Command } from 'commander';
import axios, { type AxiosInstance } from 'axios';
import WebSocket from 'ws';
import type { 
  CommandContext, 
  CLIConfig, 
  CommandResult, 
  WebSocketEvents,
  ProgressCallback 
} from '../types/index.js';
import { loadConfig, formatOutput, printError, handleAsync, retry } from '../utils/index.js';

/**
 * Base command class
 */
export abstract class BaseCommand {
  protected context: CommandContext;
  protected httpClient: AxiosInstance;
  protected wsClient?: WebSocket;
  
  constructor(context: CommandContext) {
    this.context = context;
    
    // Initialize HTTP client
    this.httpClient = axios.create({
      timeout: this.context.config.defaultTimeout,
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'ClaudeCluster-CLI/0.1.0'
      }
    });
    
    // Add request/response interceptors
    this.setupHttpInterceptors();
  }
  
  /**
   * Execute the command
   */
  abstract execute(...args: any[]): Promise<CommandResult>;
  
  /**
   * Setup HTTP interceptors
   */
  private setupHttpInterceptors(): void {
    // Request interceptor
    this.httpClient.interceptors.request.use(
      (config) => {
        if (this.context.verbose) {
          console.log(`→ ${config.method?.toUpperCase()} ${config.url}`);
        }
        return config;
      },
      (error) => {
        if (this.context.verbose) {
          console.error('Request error:', error);
        }
        return Promise.reject(error);
      }
    );
    
    // Response interceptor
    this.httpClient.interceptors.response.use(
      (response) => {
        if (this.context.verbose) {
          console.log(`← ${response.status} ${response.statusText}`);
        }
        return response;
      },
      (error) => {
        if (this.context.verbose) {
          console.error('Response error:', error.response?.status, error.response?.statusText);
        }
        return Promise.reject(error);
      }
    );
  }
  
  /**
   * Connect to WebSocket
   */
  protected async connectWebSocket(url: string): Promise<WebSocket> {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(url);
      
      ws.on('open', () => {
        if (this.context.verbose) {
          console.log(`WebSocket connected to ${url}`);
        }
        resolve(ws);
      });
      
      ws.on('error', (error: Error) => {
        if (this.context.verbose) {
          console.error('WebSocket error:', error);
        }
        reject(error);
      });
      
      ws.on('close', () => {
        if (this.context.verbose) {
          console.log('WebSocket connection closed');
        }
      });
    });
  }
  
  /**
   * Setup WebSocket event handlers
   */
  protected setupWebSocketHandlers(
    ws: WebSocket,
    handlers: Partial<WebSocketEvents>
  ): void {
    ws.on('message', (data: WebSocket.RawData) => {
      try {
        const message = JSON.parse(data.toString());
        
        switch (message.type) {
          case 'task-progress':
            handlers['task-progress']?.(message.taskId, message.progress, message.total);
            break;
            
          case 'task-completed':
            handlers['task-completed']?.(message.taskId, message.result);
            break;
            
          case 'task-failed':
            handlers['task-failed']?.(message.taskId, message.error);
            break;
            
          case 'worker-status':
            handlers['worker-status']?.(message.workerId, message.status);
            break;
            
          case 'cluster-status':
            handlers['cluster-status']?.(message.status);
            break;
            
          default:
            if (this.context.verbose) {
              console.log('Unknown WebSocket message:', message);
            }
        }
      } catch (error) {
        handlers.error?.(error instanceof Error ? error : new Error(String(error)));
      }
    });
    
    ws.on('error', (error: Error) => {
      handlers.error?.(error);
    });
  }
  
  /**
   * Make HTTP request with retry
   */
  protected async makeRequest<T>(
    method: 'GET' | 'POST' | 'PUT' | 'DELETE',
    url: string,
    data?: any,
    maxRetries: number = 3
  ): Promise<T> {
    return retry(async () => {
      const response = await this.httpClient.request({
        method,
        url,
        data
      });
      return response.data;
    }, maxRetries);
  }
  
  /**
   * Output result based on format
   */
  public outputResult(result: CommandResult): void {
    if (!result.success) {
      printError(result.error || 'Command failed');
      process.exit(1);
    }
    
    if (result.warnings && result.warnings.length > 0) {
      result.warnings.forEach(warning => {
        console.warn(`Warning: ${warning}`);
      });
    }
    
    if (result.data && !this.context.quiet) {
      const output = formatOutput(result.data, this.context.outputFormat);
      console.log(output);
    }
  }
  
  /**
   * Submit task to driver
   */
  protected async submitTaskToDriver(task: {
    title: string;
    description: string;
    category?: string;
    priority?: string;
    dependencies?: string[];
    context?: Record<string, unknown>;
  }): Promise<any> {
    return this.makeRequest('POST', `${this.context.driverUrl}/tasks`, task);
  }
  
  /**
   * Get task status from driver
   */
  protected async getTaskStatus(taskId: string): Promise<any> {
    return this.makeRequest('GET', `${this.context.driverUrl}/tasks/${taskId}`);
  }
  
  /**
   * Get cluster status from driver
   */
  protected async getClusterStatus(): Promise<any> {
    return this.makeRequest('GET', `${this.context.driverUrl}/status`);
  }
  
  /**
   * Get workers from driver
   */
  protected async getWorkers(): Promise<any> {
    return this.makeRequest('GET', `${this.context.driverUrl}/workers`);
  }
  
  /**
   * Submit task to MCP server
   */
  protected async submitTaskToMCP(task: {
    title: string;
    description: string;
    category?: string;
    priority?: string;
    dependencies?: string[];
    context?: Record<string, unknown>;
  }): Promise<any> {
    return this.makeRequest('POST', `${this.context.mcpUrl}/mcp`, {
      method: 'tools/call',
      params: {
        name: 'submit_parallel_task',
        arguments: task
      }
    });
  }
  
  /**
   * Get task status from MCP server
   */
  protected async getTaskStatusFromMCP(taskId: string): Promise<any> {
    return this.makeRequest('POST', `${this.context.mcpUrl}/mcp`, {
      method: 'tools/call',
      params: {
        name: 'get_task_status',
        arguments: { taskId }
      }
    });
  }
  
  /**
   * Create progress callback
   */
  protected createProgressCallback(message: string): ProgressCallback {
    let lastPercent = -1;
    
    return (progress) => {
      const percent = Math.floor((progress.current / progress.total) * 100);
      
      if (percent !== lastPercent) {
        lastPercent = percent;
        const bar = '█'.repeat(Math.floor(percent / 2));
        const empty = '░'.repeat(50 - Math.floor(percent / 2));
        const progressMessage = progress.message || message;
        
        process.stdout.write(`\r${progressMessage}: [${bar}${empty}] ${percent}%`);
        
        if (percent === 100) {
          process.stdout.write('\n');
        }
      }
    };
  }
  
  /**
   * Cleanup resources
   */
  protected cleanup(): void {
    if (this.wsClient) {
      this.wsClient.close();
      this.wsClient = undefined as any;
    }
  }
}

/**
 * Create command context from CLI options
 */
export async function createContext(options: {
  driverUrl?: string;
  mcpUrl?: string;
  outputFormat?: string;
  verbose?: boolean;
  quiet?: boolean;
  config?: string;
}): Promise<CommandContext> {
  // Load configuration
  const config = await loadConfig();
  
  // Override with command-line options
  const context: CommandContext = {
    config: options.config ? { ...config, configFile: options.config } : config,
    driverUrl: options.driverUrl || config.defaultDriverUrl,
    mcpUrl: options.mcpUrl || config.defaultMCPUrl,
    outputFormat: (options.outputFormat as any) || config.defaultOutputFormat,
    verbose: options.verbose || false,
    quiet: options.quiet || false
  };
  
  return context;
}

/**
 * Add common options to command
 */
export function addCommonOptions(command: Command): Command {
  return command
    .option('-d, --driver-url <url>', 'Driver server URL')
    .option('-m, --mcp-url <url>', 'MCP server URL')
    .option('-f, --format <format>', 'Output format (json|yaml|table|text)')
    .option('-v, --verbose', 'Verbose output')
    .option('-q, --quiet', 'Quiet output (minimal)')
    .option('-c, --config <file>', 'Configuration file path');
}