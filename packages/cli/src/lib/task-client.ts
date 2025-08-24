/**
 * Task client for communicating with MCP server
 */

import axios, { AxiosError } from 'axios';
import { EventSource } from 'eventsource';
import chalk from 'chalk';
import ora from 'ora';
import { TaskSubmissionRequest, TaskSubmissionResponse, SSEEvent } from '@claudecluster/shared';

export interface TaskClientOptions {
  serverUrl: string;
  prompt: string;
  workerId?: string;
  priority?: number;
  timeout?: number;
  verbose?: boolean;
  json?: boolean;
  logger: any;
}

export interface TaskResult {
  success: boolean;
  taskId: string;
  output?: string;
  error?: string;
  duration?: number;
}

export async function submitTask(options: TaskClientOptions): Promise<TaskResult> {
  const { serverUrl, prompt, workerId, priority = 5, timeout = 300000, verbose, json, logger } = options;
  
  const startTime = Date.now();
  let taskId: string;
  let eventSource: EventSource | null = null;
  let output = '';
  
  try {
    // Submit task to MCP server
    const submitUrl = `${serverUrl}/tasks`;
    const taskRequest: TaskSubmissionRequest = {
      prompt,
      workerId,
      priority,
      metadata: {
        clientType: 'cli',
        startTime: new Date().toISOString()
      }
    };
    
    logger.debug('Submitting task to MCP server', { submitUrl, taskRequest });
    
    const submitResponse = await axios.post<TaskSubmissionResponse>(submitUrl, taskRequest, {
      timeout: 10000,
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'ClaudeCluster-CLI/0.1.0'
      }
    });
    
    taskId = submitResponse.data.taskId;
    logger.info('Task submitted successfully', { taskId, status: submitResponse.data.status });
    
    if (!json) {\n      console.log(chalk.blue('🚀 Task submitted'));\n      console.log(`   Task ID: ${taskId}`);\n      console.log(`   Status: ${submitResponse.data.status}`);\n      if (submitResponse.data.estimatedDuration) {\n        console.log(`   Estimated duration: ${submitResponse.data.estimatedDuration}ms`);\n      }\n      console.log();\n    }
    
    // Set up SSE connection to stream real-time updates
    const sseUrl = `${serverUrl}/stream/${taskId}`;
    logger.debug('Connecting to SSE stream', { sseUrl });
    
    const spinner = json ? null : ora('Waiting for task execution...').start();
    
    return new Promise<TaskResult>((resolve, reject) => {
      const timeoutHandle = setTimeout(() => {
        if (eventSource) {
          eventSource.close();
        }
        if (spinner) {
          spinner.fail('Task timed out');
        }
        reject(new Error(`Task timed out after ${timeout / 1000} seconds`));
      }, timeout);
      
      eventSource = new EventSource(sseUrl);
      
      eventSource.onopen = () => {\n        logger.debug('SSE connection established');\n        if (spinner) {\n          spinner.text = 'Connected - waiting for task to start...';\n        }\n      };\n      \n      eventSource.onmessage = (event) => {\n        logger.debug('Received SSE event', { type: event.type, data: event.data });\n      };\n      \n      eventSource.addEventListener('status', (event) => {\n        const data = JSON.parse(event.data);\n        logger.debug('Status update', data);\n        \n        if (spinner && data.status) {\n          spinner.text = `Status: ${data.status}`;\n        }\n      });\n      \n      eventSource.addEventListener('task-started', (event) => {\n        const data = JSON.parse(event.data);\n        logger.info('Task started', data);\n        \n        if (!json) {\n          console.log(chalk.green('▶️  Task started'));\n          console.log(`   Worker: ${data.workerId}`);\n          console.log();\n        }\n        \n        if (spinner) {\n          spinner.text = 'Task running...';\n        }\n      });\n      \n      eventSource.addEventListener('task-progress', (event) => {\n        const data = JSON.parse(event.data);\n        \n        if (data.chunk) {\n          output += data.chunk;\n          \n          if (!json && verbose) {\n            process.stdout.write(data.chunk);\n          }\n        }\n        \n        logger.debug('Task progress', { chunkLength: data.chunk?.length || 0 });\n      });\n      \n      eventSource.addEventListener('task-completed', (event) => {\n        const data = JSON.parse(event.data);\n        logger.info('Task completed', data);\n        \n        clearTimeout(timeoutHandle);\n        if (eventSource) {\n          eventSource.close();\n        }\n        if (spinner) {\n          spinner.succeed('Task completed');\n        }\n        \n        resolve({\n          success: data.result.success,\n          taskId,\n          output: output || data.result.output,\n          duration: Date.now() - startTime\n        });\n      });\n      \n      eventSource.addEventListener('task-failed', (event) => {\n        const data = JSON.parse(event.data);\n        logger.error('Task failed', data);\n        \n        clearTimeout(timeoutHandle);\n        if (eventSource) {\n          eventSource.close();\n        }\n        if (spinner) {\n          spinner.fail('Task failed');\n        }\n        \n        resolve({\n          success: false,\n          taskId,\n          output: output,\n          error: data.error,\n          duration: Date.now() - startTime\n        });\n      });\n      \n      eventSource.addEventListener('error', (event) => {\n        const data = JSON.parse(event.data);\n        logger.error('SSE error event', data);\n        \n        if (!json) {\n          console.warn(chalk.yellow('⚠️  Warning:'), data.error);\n        }\n      });\n      \n      eventSource.addEventListener('complete', (event) => {\n        logger.debug('Stream complete event received');\n        // Connection will be closed by server\n      });\n      \n      eventSource.addEventListener('server_shutdown', (event) => {\n        logger.warn('Server shutdown event received');\n        \n        clearTimeout(timeoutHandle);\n        if (eventSource) {\n          eventSource.close();\n        }\n        if (spinner) {\n          spinner.fail('Server shutdown');\n        }\n        \n        reject(new Error('MCP server shut down during task execution'));\n      });\n      \n      eventSource.onerror = (error) => {\n        logger.error('SSE connection error', error);\n        \n        // Don't immediately fail - let the server-side error handling work\n        if (spinner) {\n          spinner.text = 'Connection lost - attempting to reconnect...';\n        }\n      };\n    });\n    \n  } catch (error) {\n    if (eventSource) {\n      eventSource.close();\n    }\n    \n    if (axios.isAxiosError(error)) {\n      const axiosError = error as AxiosError;\n      \n      if (axiosError.code === 'ECONNREFUSED') {\n        throw new Error(`Cannot connect to MCP server at ${serverUrl}. Is the server running?`);\n      }\n      \n      if (axiosError.response) {\n        const statusCode = axiosError.response.status;\n        const errorData = axiosError.response.data as any;\n        \n        if (statusCode === 503) {\n          throw new Error('No workers available. Please ensure at least one worker is running.');\n        }\n        \n        if (statusCode === 400) {\n          throw new Error(`Invalid request: ${errorData?.message || 'Bad request'}`);\n        }\n        \n        throw new Error(`Server error (${statusCode}): ${errorData?.message || axiosError.message}`);\n      }\n      \n      throw new Error(`Network error: ${axiosError.message}`);\n    }\n    \n    throw error;\n  }\n}\n\n// Node.js polyfill for EventSource in case it's not available\nif (typeof globalThis.EventSource === 'undefined') {\n  // @ts-ignore - dynamic import for Node.js environment\n  globalThis.EventSource = require('eventsource');\n}