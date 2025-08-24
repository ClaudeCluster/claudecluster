/**
 * Test client utilities for ClaudeCluster E2E testing
 */

const axios = require('axios');
const { spawn } = require('child_process');
const EventSource = require('eventsource');
const path = require('path');

class TestClient {
  constructor(options = {}) {
    this.mcpServerUrl = options.mcpServerUrl || process.env.TEST_MCP_SERVER_URL;
    this.workerUrls = options.workerUrls || (process.env.TEST_WORKER_URLS || '').split(',').filter(Boolean);
    this.timeout = options.timeout || parseInt(process.env.TEST_TIMEOUT_MS || '300000');
    this.verbose = options.verbose || false;
    
    // HTTP client with defaults
    this.http = axios.create({
      timeout: this.timeout,
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'ClaudeCluster-E2E-Tests'
      }
    });
    
    // Store active connections for cleanup
    this.activeConnections = new Set();
  }

  /**
   * Test MCP server health
   */
  async testMCPHealth() {
    if (!this.mcpServerUrl) {
      throw new Error('MCP server URL not configured');
    }

    try {
      const response = await this.http.get(`${this.mcpServerUrl}/health`);
      return {
        success: true,
        status: response.status,
        data: response.data,
        responseTime: response.config.metadata?.requestDuration || 0
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
        status: error.response?.status || 0,
        data: error.response?.data || null
      };
    }
  }

  /**
   * Test worker health
   */
  async testWorkerHealth(workerUrl) {
    try {
      const response = await this.http.get(`${workerUrl}/hello`);
      return {
        success: true,
        status: response.status,
        data: response.data,
        responseTime: response.config.metadata?.requestDuration || 0
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
        status: error.response?.status || 0,
        data: error.response?.data || null
      };
    }
  }

  /**
   * Test all worker health endpoints
   */
  async testAllWorkersHealth() {
    const results = [];
    
    for (const workerUrl of this.workerUrls) {
      const result = await this.testWorkerHealth(workerUrl);
      results.push({
        url: workerUrl,
        ...result
      });
    }
    
    return results;
  }

  /**
   * Submit task via HTTP API
   */
  async submitTaskHTTP(prompt, options = {}) {
    if (!this.mcpServerUrl) {
      throw new Error('MCP server URL not configured');
    }

    const taskRequest = {
      prompt,
      priority: options.priority || 5,
      workerId: options.workerId || null,
      metadata: options.metadata || {}
    };

    try {
      const startTime = Date.now();
      const response = await this.http.post(`${this.mcpServerUrl}/tasks`, taskRequest);
      const duration = Date.now() - startTime;

      return {
        success: true,
        status: response.status,
        data: response.data,
        duration,
        taskId: response.data?.taskId
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
        status: error.response?.status || 0,
        data: error.response?.data || null
      };
    }
  }

  /**
   * Submit task via CLI
   */
  async submitTaskCLI(prompt, options = {}) {
    return new Promise((resolve, reject) => {
      const cliPath = path.resolve(__dirname, '../../../packages/cli/dist/cli.js');
      const args = ['run', prompt];
      
      // Add CLI options
      if (this.mcpServerUrl) {
        args.push('--server', this.mcpServerUrl);
      }
      
      if (options.workerId) {
        args.push('--worker', options.workerId);
      }
      
      if (options.priority) {
        args.push('--priority', options.priority.toString());
      }
      
      if (options.timeout) {
        args.push('--timeout', Math.floor(options.timeout / 1000).toString());
      }
      
      if (options.verbose || this.verbose) {
        args.push('--verbose');
      }
      
      if (options.json !== false) {
        args.push('--json');
      }

      const startTime = Date.now();
      const process = spawn('node', [cliPath, ...args], {
        stdio: ['pipe', 'pipe', 'pipe'],
        env: { ...process.env }
      });

      let stdout = '';
      let stderr = '';

      process.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      process.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      process.on('close', (code) => {
        const duration = Date.now() - startTime;
        
        let result = {
          success: code === 0,
          exitCode: code,
          duration,
          stdout: stdout.trim(),
          stderr: stderr.trim()
        };

        // Try to parse JSON output
        if (result.stdout && options.json !== false) {
          try {
            result.data = JSON.parse(result.stdout);
            result.taskId = result.data?.taskId;
          } catch (e) {
            // Output wasn't JSON, keep as text
          }
        }

        resolve(result);
      });

      process.on('error', (error) => {
        reject(new Error(`CLI process error: ${error.message}`));
      });

      // Set timeout for CLI execution
      const timeoutMs = options.timeout || this.timeout;
      const timer = setTimeout(() => {
        process.kill('SIGTERM');
        reject(new Error(`CLI execution timed out after ${timeoutMs}ms`));
      }, timeoutMs);

      process.on('close', () => {
        clearTimeout(timer);
      });
    });
  }

  /**
   * Connect to SSE stream for a task
   */
  createSSEConnection(taskId, options = {}) {
    if (!this.mcpServerUrl) {
      throw new Error('MCP server URL not configured');
    }

    const streamUrl = `${this.mcpServerUrl}/stream/${taskId}`;
    const eventSource = new EventSource(streamUrl);
    
    // Track connection for cleanup
    this.activeConnections.add(eventSource);
    
    const events = [];
    const startTime = Date.now();

    return new Promise((resolve, reject) => {
      const timeout = options.timeout || this.timeout;
      let resolved = false;

      const cleanup = () => {
        if (!resolved) {
          resolved = true;
          eventSource.close();
          this.activeConnections.delete(eventSource);
        }
      };

      const timer = setTimeout(() => {
        cleanup();
        reject(new Error(`SSE connection timed out after ${timeout}ms`));
      }, timeout);

      eventSource.onopen = () => {
        if (this.verbose) {
          console.log(`SSE connection opened for task ${taskId}`);
        }
      };

      eventSource.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          events.push({
            timestamp: Date.now(),
            type: event.type || 'message',
            data
          });

          if (this.verbose) {
            console.log(`SSE event: ${event.type}`, data);
          }
        } catch (e) {
          events.push({
            timestamp: Date.now(),
            type: event.type || 'message',
            data: event.data,
            parseError: e.message
          });
        }
      };

      // Handle specific event types
      ['status', 'progress', 'output', 'complete', 'error'].forEach(eventType => {
        eventSource.addEventListener(eventType, (event) => {
          try {
            const data = JSON.parse(event.data);
            events.push({
              timestamp: Date.now(),
              type: eventType,
              data
            });

            if (this.verbose) {
              console.log(`SSE ${eventType}:`, data);
            }

            // Auto-resolve on completion events
            if (eventType === 'complete' || eventType === 'error') {
              clearTimeout(timer);
              cleanup();
              
              if (!resolved) {
                resolved = true;
                resolve({
                  success: eventType === 'complete',
                  events,
                  duration: Date.now() - startTime,
                  finalData: data
                });
              }
            }
          } catch (e) {
            events.push({
              timestamp: Date.now(),
              type: eventType,
              data: event.data,
              parseError: e.message
            });
          }
        });
      });

      eventSource.onerror = (error) => {
        clearTimeout(timer);
        cleanup();
        
        if (!resolved) {
          resolved = true;
          reject(new Error(`SSE connection error: ${error.message || 'Unknown error'}`));
        }
      };
    });
  }

  /**
   * Submit task and monitor via SSE
   */
  async submitTaskWithSSE(prompt, options = {}) {
    // First submit the task
    const submitResult = await this.submitTaskHTTP(prompt, options);
    
    if (!submitResult.success || !submitResult.taskId) {
      return {
        ...submitResult,
        streaming: null
      };
    }

    // Then connect to SSE stream
    try {
      const streamingResult = await this.createSSEConnection(submitResult.taskId, options);
      
      return {
        ...submitResult,
        streaming: streamingResult
      };
    } catch (streamingError) {
      return {
        ...submitResult,
        streaming: {
          success: false,
          error: streamingError.message
        }
      };
    }
  }

  /**
   * Wait for service to become healthy
   */
  async waitForHealthy(url, options = {}) {
    const maxAttempts = options.maxAttempts || 30;
    const interval = options.interval || 2000;
    const endpoint = options.endpoint || '/health';

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        const response = await this.http.get(`${url}${endpoint}`);
        
        if (response.status === 200) {
          const data = response.data;
          
          // Check if response indicates healthy state
          if (data.status === 'healthy' || data.status === 'available') {
            return {
              success: true,
              attempts: attempt,
              data
            };
          }
        }
      } catch (error) {
        // Service not ready yet, continue trying
        if (this.verbose) {
          console.log(`Health check attempt ${attempt}/${maxAttempts} failed:`, error.message);
        }
      }

      if (attempt < maxAttempts) {
        await new Promise(resolve => setTimeout(resolve, interval));
      }
    }

    return {
      success: false,
      attempts: maxAttempts,
      error: 'Service did not become healthy within timeout'
    };
  }

  /**
   * Cleanup all active connections
   */
  cleanup() {
    for (const connection of this.activeConnections) {
      try {
        if (connection.close) {
          connection.close();
        }
      } catch (e) {
        // Ignore cleanup errors
      }
    }
    this.activeConnections.clear();
  }
}

module.exports = { TestClient };