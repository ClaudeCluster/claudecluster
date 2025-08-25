/**
 * @fileoverview Task management commands
 */

import { readFile } from 'fs/promises';
import inquirer from 'inquirer';
import { BaseCommand, createContext, addCommonOptions } from './base.js';
import type { CommandResult, TaskSubmissionOptions, TaskQueryOptions } from '../types/index.js';
import { handleAsync, ProgressIndicator, parseDuration, formatDuration, createResult } from '../utils/index.js';

/**
 * Task submission command
 */
export class SubmitTaskCommand extends BaseCommand {
  async execute(options: TaskSubmissionOptions): Promise<CommandResult> {
    const spinner = new ProgressIndicator('Preparing task submission...');
    
    try {
      let taskData: any;
      
      if (options.file) {
        // Load task from file
        spinner.updateMessage('Loading task from file...');
        spinner.start();
        
        const content = await readFile(options.file, 'utf-8');
        taskData = JSON.parse(content);
        
        spinner.succeed('Task loaded from file');
      } else if (options.interactive) {
        // Interactive task creation
        spinner.stop();
        taskData = await this.promptForTaskDetails();
      } else {
        // Use provided options
        taskData = {
          title: options.title,
          description: options.description,
          category: options.category || 'coding',
          priority: options.priority || 'normal',
          dependencies: options.dependencies || [],
          context: options.context || {}
        };
      }
      
      // Validate task data
      if (!taskData.title || !taskData.description) {
        return createResult(false, undefined, 'Task must have title and description');
      }
      
      // Submit task
      spinner.updateMessage('Submitting task to cluster...');
      spinner.start();
      
      const result = await this.submitTaskToDriver(taskData);
      
      spinner.succeed('Task submitted successfully');
      
      // Watch progress if requested
      if (options.watch) {
        await this.watchTaskProgress(result.taskId, options.timeout);
      }
      
      return createResult(true, {
        taskId: result.taskId,
        status: result.status,
        message: 'Task submitted successfully'
      });
      
    } catch (error) {
      spinner.fail('Failed to submit task');
      return createResult(false, undefined, error instanceof Error ? error.message : String(error));
    }
  }
  
  /**
   * Prompt for task details interactively
   */
  private async promptForTaskDetails(): Promise<any> {
    const questions = [
      {
        type: 'input',
        name: 'title',
        message: 'Task title:',
        validate: (input: string) => input.length > 0 || 'Title is required'
      },
      {
        type: 'input',
        name: 'description',
        message: 'Task description:',
        validate: (input: string) => input.length > 0 || 'Description is required'
      },
      {
        type: 'list',
        name: 'category',
        message: 'Task category:',
        choices: ['coding', 'analysis', 'refactoring', 'testing', 'documentation'],
        default: 'coding'
      },
      {
        type: 'list',
        name: 'priority',
        message: 'Task priority:',
        choices: ['critical', 'high', 'normal', 'low', 'background'],
        default: 'normal'
      },
      {
        type: 'input',
        name: 'dependencies',
        message: 'Dependencies (comma-separated task IDs):',
        filter: (input: string) => input ? input.split(',').map(id => id.trim()) : []
      },
      {
        type: 'confirm',
        name: 'addContext',
        message: 'Add additional context?',
        default: false
      }
    ];
    
    const answers = await inquirer.prompt(questions);
    
    if (answers['addContext']) {
      const contextQuestions = [
        {
          type: 'input',
          name: 'codebaseUrl',
          message: 'Codebase URL (optional):'
        },
        {
          type: 'input',
          name: 'branch',
          message: 'Git branch (optional):'
        },
        {
          type: 'input',
          name: 'files',
          message: 'Relevant files (comma-separated):',
          filter: (input: string) => input ? input.split(',').map(file => file.trim()) : []
        }
      ];
      
      const contextAnswers = await inquirer.prompt(contextQuestions);
      answers['context'] = Object.fromEntries(
        Object.entries(contextAnswers).filter(([, value]) => value)
      );
    }
    
    return answers;
  }
  
  /**
   * Watch task progress
   */
  private async watchTaskProgress(taskId: string, timeout?: number): Promise<void> {
    const startTime = Date.now();
    const timeoutMs = timeout ? parseDuration(timeout.toString()) : this.context.config.defaultTimeout;
    
    console.log(`\nWatching task ${taskId}...`);
    
    // Try WebSocket first, fall back to polling
    try {
      const wsUrl = `${this.context.driverUrl.replace('http', 'ws')}/ws/tasks/${taskId}/progress`;
      const ws = await this.connectWebSocket(wsUrl);
      
      this.setupWebSocketHandlers(ws, {
        'task-progress': (taskIdReceived, progress, total) => {
          if (taskIdReceived === taskId) {
            const percent = total ? Math.floor((progress / total) * 100) : 0;
            console.log(`Progress: ${percent}% (${progress}${total ? `/${total}` : ''})`);
          }
        },
        'task-completed': (taskIdReceived, result) => {
          if (taskIdReceived === taskId) {
            console.log('✅ Task completed successfully');
            console.log('Result:', result);
            ws.close();
          }
        },
        'task-failed': (taskIdReceived, error) => {
          if (taskIdReceived === taskId) {
            console.log('❌ Task failed:', error);
            ws.close();
          }
        }
      });
      
    } catch (error) {
      // Fall back to polling
      console.log('WebSocket not available, using polling...');
      await this.pollTaskStatus(taskId, timeoutMs, startTime);
    }
  }
  
  /**
   * Poll task status
   */
  private async pollTaskStatus(taskId: string, timeoutMs: number, startTime: number): Promise<void> {
    const pollInterval = 2000; // 2 seconds
    
    while (Date.now() - startTime < timeoutMs) {
      try {
        const status = await this.getTaskStatus(taskId);
        const elapsed = formatDuration(Date.now() - startTime);
        
        console.log(`Status: ${status.status} (elapsed: ${elapsed})`);
        
        if (status.progress) {
          const percent = status.progress.total 
            ? Math.floor((status.progress.current / status.progress.total) * 100)
            : 0;
          console.log(`Progress: ${percent}%`);
        }
        
        if (status.status === 'completed') {
          console.log('✅ Task completed successfully');
          if (status.result) {
            console.log('Result:', status.result);
          }
          break;
        }
        
        if (status.status === 'failed') {
          console.log('❌ Task failed');
          if (status.error) {
            console.log('Error:', status.error);
          }
          break;
        }
        
        await new Promise(resolve => setTimeout(resolve, pollInterval));
        
      } catch (error) {
        console.error('Error polling task status:', error);
        await new Promise(resolve => setTimeout(resolve, pollInterval));
      }
    }
  }
}

/**
 * Task status command
 */
export class TaskStatusCommand extends BaseCommand {
  async execute(taskId: string): Promise<CommandResult> {
    const result = await handleAsync(
      this.getTaskStatus(taskId),
      'Failed to get task status'
    );
    
    if (!result.success) {
      return result;
    }
    
    const status = result.data;
    const duration = status.endTime 
      ? Date.parse(status.endTime) - Date.parse(status.startTime)
      : Date.now() - Date.parse(status.startTime);
    
    return createResult(true, {
      taskId,
      status: status.status,
      startTime: status.startTime,
      endTime: status.endTime,
      duration: formatDuration(duration),
      progress: status.progress,
      result: status.result,
      error: status.error
    });
  }
}

/**
 * Task list command
 */
export class TaskListCommand extends BaseCommand {
  async execute(options: TaskQueryOptions = {}): Promise<CommandResult> {
    const queryParams = new URLSearchParams();
    
    if (options.status) queryParams.set('status', options.status);
    if (options.category) queryParams.set('category', options.category);
    if (options.priority) queryParams.set('priority', options.priority);
    if (options.limit) queryParams.set('limit', options.limit.toString());
    if (options.offset) queryParams.set('offset', options.offset.toString());
    if (options.sortBy) queryParams.set('sortBy', options.sortBy);
    if (options.sortOrder) queryParams.set('sortOrder', options.sortOrder);
    
    const url = `${this.context.driverUrl}/tasks?${queryParams.toString()}`;
    const result = await handleAsync(this.makeRequest('GET', url), 'Failed to list tasks');
    
    if (!result.success) {
      return result;
    }
    
    // Format tasks for display
    const tasks = (result.data as any).tasks.map((task: any) => ({
      id: task.id,
      title: task.title,
      status: task.status,
      category: task.category,
      priority: task.priority,
      created: new Date(task.createdAt).toLocaleDateString(),
      duration: task.endTime 
        ? formatDuration(Date.parse(task.endTime) - Date.parse(task.startTime))
        : formatDuration(Date.now() - Date.parse(task.startTime))
    }));
    
    return createResult(true, {
      total: (result.data as any).total,
      tasks
    });
  }
}

/**
 * Task cancel command
 */
export class TaskCancelCommand extends BaseCommand {
  async execute(taskId: string): Promise<CommandResult> {
    const result = await handleAsync(
      this.makeRequest('DELETE', `${this.context.driverUrl}/tasks/${taskId}`),
      'Failed to cancel task'
    );
    
    if (!result.success) {
      return result;
    }
    
    return createResult(true, {
      taskId,
      message: 'Task cancelled successfully'
    });
  }
}

/**
 * Add task commands to program
 */
export function addTaskCommands(program: any): void {
  const taskCommand = program
    .command('task')
    .description('Task management commands');
  
  // Submit task
  const submitCommand = taskCommand
    .command('submit')
    .description('Submit a new task')
    .option('-t, --title <title>', 'Task title')
    .option('--description <description>', 'Task description')
    .option('--category <category>', 'Task category', 'coding')
    .option('-p, --priority <priority>', 'Task priority', 'normal')
    .option('--dependencies <ids>', 'Comma-separated dependency task IDs')
    .option('--file <file>', 'Load task from JSON file')
    .option('-i, --interactive', 'Interactive task creation')
    .option('-w, --watch', 'Watch task progress')
    .option('--timeout <duration>', 'Timeout for task completion')
    .action(async (options: any) => {
      const context = await createContext(options);
      const command = new SubmitTaskCommand(context);
      const result = await command.execute(options);
      command.outputResult(result);
    });
  
  addCommonOptions(submitCommand);
  
  // Task status
  const statusCommand = taskCommand
    .command('status <taskId>')
    .description('Get task status')
    .action(async (taskId: string, options: any) => {
      const context = await createContext(options);
      const command = new TaskStatusCommand(context);
      const result = await command.execute(taskId);
      command.outputResult(result);
    });
  
  addCommonOptions(statusCommand);
  
  // List tasks
  const listCommand = taskCommand
    .command('list')
    .description('List tasks')
    .option('--status <status>', 'Filter by status')
    .option('--category <category>', 'Filter by category')
    .option('--priority <priority>', 'Filter by priority')
    .option('--limit <number>', 'Limit number of results', '50')
    .option('--offset <number>', 'Offset for pagination', '0')
    .option('--sort-by <field>', 'Sort by field', 'createdAt')
    .option('--sort-order <order>', 'Sort order (asc|desc)', 'desc')
    .action(async (options: any) => {
      const context = await createContext(options);
      const command = new TaskListCommand(context);
      const result = await command.execute({
        status: options.status,
        category: options.category,
        priority: options.priority,
        limit: parseInt(options.limit),
        offset: parseInt(options.offset),
        sortBy: options.sortBy as any,
        sortOrder: options.sortOrder as any
      });
      command.outputResult(result);
    });
  
  addCommonOptions(listCommand);
  
  // Cancel task
  const cancelCommand = taskCommand
    .command('cancel <taskId>')
    .description('Cancel a task')
    .action(async (taskId: string, options: any) => {
      const context = await createContext(options);
      const command = new TaskCancelCommand(context);
      const result = await command.execute(taskId);
      command.outputResult(result);
    });
  
  addCommonOptions(cancelCommand);
}