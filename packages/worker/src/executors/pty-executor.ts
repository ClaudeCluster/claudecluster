import { BaseTaskExecutor } from './base-executor';
import { TaskResult, ProcessHandle, SpawnOptions } from '../interfaces';
import { TaskSubmissionRequest } from '../schemas';
import { logger } from '../logger';
import { config } from '../config';

// Import will be uncommented when node-pty compilation issue is resolved
// import * as pty from 'node-pty';

/**
 * PTY-based task executor for actual Claude Code CLI execution
 * Replaces StubTaskExecutor in Phase 1
 */
export class PTYTaskExecutor extends BaseTaskExecutor {
  private activeProcesses: Map<string, ProcessHandle> = new Map();
  private readonly claudeCliPath: string;
  private readonly defaultTimeout: number;

  constructor() {
    super();
    this.claudeCliPath = process.env.CLAUDE_CLI_PATH || 'claude';
    this.defaultTimeout = parseInt(process.env.PTY_TIMEOUT_MS || '300000', 10); // 5 minutes default
  }

  async execute(taskId: string, request: TaskSubmissionRequest): Promise<TaskResult> {
    const startTime = Date.now();
    
    // Create and track task status
    this.createTaskStatus(taskId);
    this.updateTaskStatus(taskId, 'running');
    
    logger.info(`Starting PTY execution for task ${taskId}`, {
      promptLength: request.prompt.length,
      priority: request.priority,
      claudeCliPath: this.claudeCliPath
    });

    try {
      // TODO: Uncomment when node-pty is working
      // const result = await this.spawnClaudeProcess(taskId, request);
      
      // For now, return a mock result that simulates PTY behavior
      const mockResult = await this.mockPtyExecution(taskId, request, startTime);
      
      this.updateTaskStatus(taskId, 'completed');
      return mockResult;
      
    } catch (error) {
      logger.error(`PTY execution failed for task ${taskId}:`, error);
      this.updateTaskStatus(taskId, 'failed');
      
      return {
        taskId,
        status: 'failed',
        error: error instanceof Error ? error.message : String(error),
        duration: Date.now() - startTime
      };
    }
  }

  // Mock execution for development without compiled node-pty
  private async mockPtyExecution(
    taskId: string, 
    request: TaskSubmissionRequest, 
    startTime: number
  ): Promise<TaskResult> {
    logger.info(`[MOCK PTY] Simulating Claude CLI execution for task ${taskId}`);
    
    // Simulate PTY startup and command execution
    await this.delay(1000);
    this.updateTaskStatus(taskId, 'running', 25);
    
    // Simulate command processing
    await this.delay(2000);
    this.updateTaskStatus(taskId, 'running', 75);
    
    // Simulate completion
    await this.delay(1000);
    this.updateTaskStatus(taskId, 'running', 100);
    
    return {
      taskId,
      status: 'completed',
      output: `[MOCK] PTY execution completed for prompt: "${request.prompt.substring(0, 100)}..."\nClaude CLI would have processed this request.`,
      duration: Date.now() - startTime
    };
  }

  // Real PTY implementation (commented until node-pty compilation is fixed)
  /*
  private async spawnClaudeProcess(taskId: string, request: TaskSubmissionRequest): Promise<TaskResult> {
    const startTime = Date.now();
    
    const processHandle: ProcessHandle = {
      id: taskId,
      command: this.claudeCliPath,
      args: this.buildClaudeArgs(request),
      status: 'running',
      createdAt: new Date()
    };

    this.activeProcesses.set(taskId, processHandle);

    return new Promise((resolve, reject) => {
      let output = '';
      let errorOutput = '';
      let hasTimedOut = false;

      // Spawn the Claude CLI process
      const ptyProcess = pty.spawn(this.claudeCliPath, processHandle.args, {
        name: 'xterm-color',
        cols: 80,
        rows: 24,
        cwd: process.cwd(),
        env: this.buildEnvironment(request)
      });

      processHandle.pid = ptyProcess.pid;
      
      // Set up timeout
      const timeoutHandle = setTimeout(() => {
        hasTimedOut = true;
        ptyProcess.kill('SIGTERM');
        logger.warn(`Task ${taskId} timed out after ${this.defaultTimeout}ms`);
      }, this.defaultTimeout);

      // Handle process output
      ptyProcess.onData((data: string) => {
        output += data;
        logger.debug(`PTY output for task ${taskId}:`, { dataLength: data.length });
        
        // Update progress based on output patterns
        this.updateProgressFromOutput(taskId, data);
      });

      // Handle process exit
      ptyProcess.onExit((exitCode: number, signal?: number) => {
        clearTimeout(timeoutHandle);
        processHandle.status = exitCode === 0 ? 'completed' : 'failed';
        
        const duration = Date.now() - startTime;
        
        if (hasTimedOut) {
          processHandle.status = 'killed';
          reject(new Error(`Process timed out after ${this.defaultTimeout}ms`));
          return;
        }

        const result: TaskResult = {
          taskId,
          status: exitCode === 0 ? 'completed' : 'failed',
          output: output.trim(),
          error: exitCode !== 0 ? `Process exited with code ${exitCode}` : undefined,
          exitCode,
          duration
        };

        logger.info(`PTY process completed for task ${taskId}`, {
          exitCode,
          signal,
          duration,
          outputLength: output.length
        });

        // Clean up
        this.activeProcesses.delete(taskId);
        
        if (exitCode === 0) {
          resolve(result);
        } else {
          reject(new Error(result.error || 'Process failed'));
        }
      });

      // Send the prompt to the Claude CLI
      setTimeout(() => {
        ptyProcess.write(request.prompt + '\r');
      }, 1000);
    });
  }
  */

  private buildClaudeArgs(request: TaskSubmissionRequest): string[] {
    const args = ['--headless'];
    
    if (request.workerId) {
      args.push('--worker-id', request.workerId);
    }
    
    if (request.priority !== undefined) {
      args.push('--priority', request.priority.toString());
    }

    return args;
  }

  private buildEnvironment(request: TaskSubmissionRequest): Record<string, string> {
    const env = { ...process.env };
    
    // Add task-specific environment variables
    env.CLAUDE_TASK_ID = request.workerId || '';
    env.CLAUDE_PRIORITY = request.priority?.toString() || '5';
    
    if (request.metadata) {
      env.CLAUDE_METADATA = JSON.stringify(request.metadata);
    }

    return env as Record<string, string>;
  }

  private updateProgressFromOutput(taskId: string, output: string): void {
    // Analyze output to determine progress
    let progress = 50; // Default to 50% if we can't determine
    
    if (output.includes('Starting')) {
      progress = 10;
    } else if (output.includes('Processing')) {
      progress = 50;
    } else if (output.includes('Completed') || output.includes('Done')) {
      progress = 90;
    }
    
    this.updateTaskStatus(taskId, 'running', progress);
  }

  async cancel(taskId: string): Promise<boolean> {
    const processHandle = this.activeProcesses.get(taskId);
    
    if (processHandle && processHandle.status === 'running') {
      logger.info(`Cancelling PTY process for task ${taskId}`);
      
      // TODO: Uncomment when node-pty is working
      // Kill the actual process
      // if (processHandle.pid) {
      //   process.kill(processHandle.pid, 'SIGTERM');
      // }
      
      processHandle.status = 'killed';
      this.activeProcesses.delete(taskId);
      return await super.cancel(taskId);
    }
    
    return false;
  }

  async cleanup(): Promise<void> {
    // Kill any running processes
    for (const [taskId, processHandle] of this.activeProcesses) {
      if (processHandle.status === 'running') {
        await this.cancel(taskId);
      }
    }
    
    this.activeProcesses.clear();
    await super.cleanup();
    
    logger.info('PTY executor cleaned up');
  }

  // Utility method for mock execution
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // Get active processes for monitoring
  getActiveProcesses(): ProcessHandle[] {
    return Array.from(this.activeProcesses.values());
  }

  getProcessCount(): number {
    return this.activeProcesses.size;
  }
}