/**
 * @fileoverview Process Pool Provider Implementation
 * 
 * Refactors the existing ClaudeProcessPool to implement the new ExecutionProvider
 * interface while maintaining all current functionality.
 */

import { v4 as uuidv4 } from 'uuid';
import {
  BaseProvider,
  ExecutionProvider,
  Executor,
  ExecutionMode,
  ExecutorState,
  ExecutorStatus,
  ExecutorError,
  ErrorCodes
} from './provider.js';
import {
  ClaudeCodeProcess,
  ClaudeProcessPool,
  ClaudeProcessStatus,
  type ClaudeProcessConfig,
  type ClaudeProcessResult
} from '../process/index.js';
import type { Task, TaskResult, WorkerConfig } from '@claudecluster/core';

/**
 * Process Executor implementation
 * 
 * Wraps ClaudeCodeProcess to implement the Executor interface
 */
export class ProcessExecutor implements Executor {
  private readonly id: string;
  private state: ExecutorState = ExecutorState.INITIALIZING;
  private currentTask?: string;
  private readonly startTime: Date;
  private tasksCompleted = 0;
  private lastActivity: Date;

  constructor(
    private process: ClaudeCodeProcess,
    private poolProvider: ProcessPoolProvider
  ) {
    this.id = uuidv4();
    this.startTime = new Date();
    this.lastActivity = new Date();
    
    // Map process status to executor state
    this.updateStateFromProcess();
    
    // Set up process event handlers
    this.process.on('status', (status: ClaudeProcessStatus) => {
      this.updateStateFromProcess();
      this.lastActivity = new Date();
    });
    
    this.process.on('error', (error: Error) => {
      this.state = ExecutorState.ERROR;
      this.lastActivity = new Date();
    });
    
    this.process.on('exit', () => {
      this.state = ExecutorState.TERMINATED;
      this.lastActivity = new Date();
    });
  }

  /**
   * Execute a task using the wrapped process
   */
  async execute(task: Task): Promise<TaskResult> {
    if (this.state !== ExecutorState.IDLE) {
      throw new ExecutorError(
        `Cannot execute task in ${this.state} state`,
        ErrorCodes.EXECUTOR_EXECUTION_FAILED,
        this.id
      );
    }

    this.state = ExecutorState.EXECUTING;
    this.currentTask = task.id;
    this.lastActivity = new Date();
    const startTime = Date.now();

    try {
      // Convert task to command that Claude Code can execute
      const command = this.buildCommandFromTask(task);
      
      // Execute command in the process
      const processResult: ClaudeProcessResult = await this.process.executeCommand(
        command,
        task.timeout || 300000 // 5 minute default timeout
      );

      // Convert process result to task result
      const taskResult: TaskResult = await this.convertProcessResultToTaskResult(
        processResult,
        task,
        Date.now() - startTime
      );

      this.state = ExecutorState.IDLE;
      this.currentTask = undefined;
      this.tasksCompleted++;
      this.lastActivity = new Date();

      return taskResult;

    } catch (error) {
      this.state = ExecutorState.ERROR;
      this.currentTask = undefined;
      this.lastActivity = new Date();

      throw new ExecutorError(
        `Task execution failed: ${error instanceof Error ? error.message : String(error)}`,
        ErrorCodes.EXECUTOR_EXECUTION_FAILED,
        this.id,
        error instanceof Error ? error : new Error(String(error))
      );
    }
  }

  /**
   * Terminate the executor
   */
  async terminate(): Promise<void> {
    if (this.state === ExecutorState.TERMINATED) {
      return;
    }

    this.state = ExecutorState.TERMINATING;
    this.lastActivity = new Date();

    try {
      await this.process.stop();
      this.state = ExecutorState.TERMINATED;
    } catch (error) {
      this.state = ExecutorState.ERROR;
      throw new ExecutorError(
        `Failed to terminate executor: ${error instanceof Error ? error.message : String(error)}`,
        ErrorCodes.EXECUTOR_TERMINATION_FAILED,
        this.id,
        error instanceof Error ? error : new Error(String(error))
      );
    }
  }

  /**
   * Check if executor is healthy
   */
  isHealthy(): boolean {
    return this.process.isHealthy() && this.state !== ExecutorState.ERROR;
  }

  /**
   * Get executor status
   */
  getStatus(): ExecutorStatus {
    const uptime = Date.now() - this.startTime.getTime();
    const processOutput = this.process.getOutput();
    const memoryUsage = process.memoryUsage();

    return {
      id: this.id,
      mode: ExecutionMode.PROCESS_POOL,
      state: this.state,
      currentTask: this.currentTask,
      uptime,
      tasksCompleted: this.tasksCompleted,
      lastActivity: this.lastActivity,
      resourceUsage: {
        memory: memoryUsage.heapUsed,
        cpu: 0 // CPU usage would require additional monitoring
      }
    };
  }

  /**
   * Update executor state based on process status
   */
  private updateStateFromProcess(): void {
    const processStatus = this.process.getStatus();
    
    switch (processStatus) {
      case ClaudeProcessStatus.STARTING:
        this.state = ExecutorState.INITIALIZING;
        break;
      case ClaudeProcessStatus.READY:
        if (this.state === ExecutorState.INITIALIZING) {
          this.state = ExecutorState.IDLE;
        }
        break;
      case ClaudeProcessStatus.BUSY:
        // Keep current state if executing, otherwise set to executing
        if (this.state !== ExecutorState.EXECUTING) {
          this.state = ExecutorState.EXECUTING;
        }
        break;
      case ClaudeProcessStatus.ERROR:
        this.state = ExecutorState.ERROR;
        break;
      case ClaudeProcessStatus.TERMINATED:
        this.state = ExecutorState.TERMINATED;
        break;
      default:
        break;
    }
  }

  /**
   * Build command from task
   */
  private buildCommandFromTask(task: Task): string {
    // This is a simplified command builder
    // In a real implementation, this would be more sophisticated
    const context = task.context || {};
    
    let command = '';
    
    // Add context if provided
    if (context.workingDirectory) {
      command += `cd "${context.workingDirectory}" && `;
    }
    
    // Add the main task description as a comment/instruction
    command += `# Task: ${task.title}\n`;
    command += `# Description: ${task.description}\n`;
    
    // If the task has specific commands, use them
    if (context.commands && Array.isArray(context.commands)) {
      command += context.commands.join(' && ');
    } else {
      // Default to asking Claude Code to work on the task
      command += `echo "Working on: ${task.description}"`;
    }
    
    return command;
  }

  /**
   * Convert process result to task result
   */
  private async convertProcessResultToTaskResult(
    processResult: ClaudeProcessResult,
    task: Task,
    duration: number
  ): Promise<TaskResult> {
    // Extract relevant information from process output
    const outputText = processResult.output
      .map(output => output.data)
      .join('');

    // Determine if task was successful
    const isSuccess = processResult.exitCode === 0 && !processResult.error;

    return {
      id: uuidv4(),
      taskId: task.id,
      status: isSuccess ? 'completed' : 'failed',
      result: {
        success: isSuccess,
        output: outputText,
        artifacts: [], // Could extract files or other artifacts
        metadata: {
          executionTime: duration,
          exitCode: processResult.exitCode,
          processUptime: this.process.getUptime()
        }
      },
      executionTime: duration,
      completedAt: new Date(),
      error: processResult.error ? new Error(processResult.error) : undefined
    };
  }

  /**
   * Get the underlying process for pool management
   */
  getProcess(): ClaudeCodeProcess {
    return this.process;
  }
}

/**
 * Process Pool Provider implementation
 * 
 * Implements ExecutionProvider interface using the existing ClaudeProcessPool
 */
export class ProcessPoolProvider extends BaseProvider {
  private pool: ClaudeProcessPool;
  private activeExecutors = new Map<string, ProcessExecutor>();

  constructor(config: WorkerConfig) {
    super(config);
    
    // Create process pool configuration from worker config
    const processConfig: ClaudeProcessConfig = {
      claudeCodePath: config.processPool?.claudeCodePath,
      workspaceDir: config.processPool?.workspaceDir || './workspace',
      tempDir: config.processPool?.tempDir || './temp',
      timeout: config.processPool?.processTimeout || 300000, // 5 minutes
      maxMemoryMB: config.processPool?.maxMemoryMB || 1024, // 1GB
      environment: config.processPool?.environment || {},
      shell: config.processPool?.shell
    };

    // Initialize the process pool
    this.pool = new ClaudeProcessPool(
      processConfig,
      config.processPool?.maxProcesses || 5
    );

    // Set up pool event handlers
    this.setupPoolEventHandlers();
  }

  /**
   * Get an executor for task execution
   */
  async getExecutor(task: Task, mode: ExecutionMode): Promise<Executor> {
    if (mode !== ExecutionMode.PROCESS_POOL) {
      throw new Error(`ProcessPoolProvider does not support mode: ${mode}`);
    }

    if (this.isShuttingDown) {
      throw new Error('Provider is shutting down');
    }

    try {
      // Get a process from the pool
      const process = await this.pool.getProcess();
      
      // Wrap it in a ProcessExecutor
      const executor = new ProcessExecutor(process, this);
      
      // Track the executor
      this.activeExecutors.set(executor.getStatus().id, executor);
      
      return executor;

    } catch (error) {
      throw new ExecutorError(
        `Failed to get executor: ${error instanceof Error ? error.message : String(error)}`,
        ErrorCodes.EXECUTOR_CREATION_FAILED,
        'unknown',
        error instanceof Error ? error : new Error(String(error))
      );
    }
  }

  /**
   * Release an executor back to the provider
   */
  async release(executor: Executor): Promise<void> {
    if (!(executor instanceof ProcessExecutor)) {
      throw new Error('Invalid executor type for ProcessPoolProvider');
    }

    try {
      // Remove from active executors
      this.activeExecutors.delete(executor.getStatus().id);
      
      // Release the process back to the pool
      this.pool.releaseProcess(executor.getProcess());
      
      // Call parent release method
      await super.release(executor);

    } catch (error) {
      throw new ExecutorError(
        `Failed to release executor: ${error instanceof Error ? error.message : String(error)}`,
        ErrorCodes.EXECUTOR_TERMINATION_FAILED,
        executor.getStatus().id,
        error instanceof Error ? error : new Error(String(error))
      );
    }
  }

  /**
   * Clean up all resources
   */
  async cleanup(): Promise<void> {
    await super.cleanup();
    
    try {
      // Terminate all active executors
      const terminatePromises = Array.from(this.activeExecutors.values()).map(
        executor => executor.terminate().catch(error => 
          console.error('Failed to terminate executor during cleanup:', error)
        )
      );
      
      await Promise.all(terminatePromises);
      
      // Shutdown the process pool
      await this.pool.shutdown();
      
      this.activeExecutors.clear();

    } catch (error) {
      throw new ExecutorError(
        `Failed to cleanup provider: ${error instanceof Error ? error.message : String(error)}`,
        ErrorCodes.PROVIDER_CLEANUP_FAILED,
        'provider',
        error instanceof Error ? error : new Error(String(error))
      );
    }
  }

  /**
   * Get the execution mode
   */
  getMode(): ExecutionMode {
    return ExecutionMode.PROCESS_POOL;
  }

  /**
   * Get total number of executors
   */
  protected getTotalExecutors(): number {
    const poolStats = this.pool.getStats();
    return poolStats.total;
  }

  /**
   * Get number of active executors
   */
  protected getActiveExecutors(): number {
    const poolStats = this.pool.getStats();
    return poolStats.busy;
  }

  /**
   * Get number of idle executors
   */
  protected getIdleExecutors(): number {
    const poolStats = this.pool.getStats();
    return poolStats.available;
  }

  /**
   * Get resource usage
   */
  protected getResourceUsage(): {
    totalMemory: number;
    usedMemory: number;
    totalCpu: number;
    usedCpu: number;
  } {
    // Get memory usage from active executors
    let usedMemory = 0;
    let usedCpu = 0;
    
    for (const executor of this.activeExecutors.values()) {
      const status = executor.getStatus();
      usedMemory += status.resourceUsage.memory;
      usedCpu += status.resourceUsage.cpu;
    }

    // Estimate total available resources
    const poolStats = this.pool.getStats();
    const maxProcesses = this.config.processPool?.maxProcesses || 5;
    const maxMemoryPerProcess = this.config.processPool?.maxMemoryMB || 1024;
    
    return {
      totalMemory: maxProcesses * maxMemoryPerProcess * 1024 * 1024, // Convert MB to bytes
      usedMemory,
      totalCpu: maxProcesses * 1000, // Arbitrary CPU units
      usedCpu
    };
  }

  /**
   * Set up pool event handlers
   */
  private setupPoolEventHandlers(): void {
    this.pool.on('error', (error: Error) => {
      console.error('Process pool error:', error);
    });

    // Add other pool-specific event handlers as needed
  }

  /**
   * Get process pool instance (for testing or advanced usage)
   */
  getPool(): ClaudeProcessPool {
    return this.pool;
  }
}

export default ProcessPoolProvider;