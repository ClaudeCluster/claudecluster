/**
 * @fileoverview Execution Provider Interface
 * 
 * This module defines the abstract ExecutionProvider interface that supports
 * both process pool and container execution modes for ClaudeCluster.
 */

import type { Task, TaskResult, WorkerConfig } from '@claudecluster/core';

/**
 * Execution modes supported by the system
 */
export enum ExecutionMode {
  PROCESS_POOL = 'process_pool',
  CONTAINER_AGENTIC = 'container_agentic'
}

/**
 * Executor interface for executing tasks
 */
export interface Executor {
  /**
   * Execute a task and return the result
   */
  execute(task: Task): Promise<TaskResult>;
  
  /**
   * Terminate the executor and clean up resources
   */
  terminate(): Promise<void>;
  
  /**
   * Check if the executor is healthy and ready to execute tasks
   */
  isHealthy(): boolean;
  
  /**
   * Get executor metadata and status information
   */
  getStatus(): ExecutorStatus;
}

/**
 * Executor status information
 */
export interface ExecutorStatus {
  id: string;
  mode: ExecutionMode;
  state: ExecutorState;
  currentTask?: string;
  uptime: number;
  tasksCompleted: number;
  lastActivity: Date;
  resourceUsage: {
    memory: number;
    cpu: number;
  };
}

/**
 * Executor states
 */
export enum ExecutorState {
  INITIALIZING = 'initializing',
  IDLE = 'idle',
  EXECUTING = 'executing',
  TERMINATING = 'terminating',
  TERMINATED = 'terminated',
  ERROR = 'error'
}

/**
 * Execution Provider interface
 * 
 * Defines the contract for getting executors, releasing them, and managing resources
 */
export interface ExecutionProvider {
  /**
   * Get an executor for task execution
   */
  getExecutor(task: Task, mode: ExecutionMode): Promise<Executor>;
  
  /**
   * Release an executor back to the provider
   */
  release(executor: Executor): Promise<void>;
  
  /**
   * Clean up all resources and shut down the provider
   */
  cleanup(): Promise<void>;
  
  /**
   * Get the current execution mode
   */
  getMode(): ExecutionMode;
  
  /**
   * Get provider statistics and status
   */
  getStats(): ProviderStats;
  
  /**
   * Check if the provider is healthy and operational
   */
  isHealthy(): boolean;
}

/**
 * Provider statistics
 */
export interface ProviderStats {
  mode: ExecutionMode;
  totalExecutors: number;
  activeExecutors: number;
  idleExecutors: number;
  tasksCompleted: number;
  tasksActive: number;
  averageTaskDuration: number;
  uptime: number;
  resourceUsage: {
    totalMemory: number;
    usedMemory: number;
    totalCpu: number;
    usedCpu: number;
  };
}

/**
 * Base Provider abstract class
 * 
 * Provides common functionality shared between different execution providers
 */
export abstract class BaseProvider implements ExecutionProvider {
  protected readonly config: WorkerConfig;
  protected readonly startTime: Date;
  protected isShuttingDown = false;
  protected tasksCompleted = 0;
  protected readonly taskDurations: number[] = [];

  constructor(config: WorkerConfig) {
    this.config = config;
    this.startTime = new Date();
  }

  /**
   * Abstract method to get an executor - must be implemented by subclasses
   */
  abstract getExecutor(task: Task, mode: ExecutionMode): Promise<Executor>;

  /**
   * Release an executor back to the provider
   */
  async release(executor: Executor): Promise<void> {
    if (executor.getStatus().state !== ExecutorState.TERMINATED) {
      await executor.terminate();
    }
  }

  /**
   * Clean up all resources - base implementation
   */
  async cleanup(): Promise<void> {
    this.isShuttingDown = true;
    // Subclasses should override this method to add specific cleanup logic
  }

  /**
   * Get the execution mode - must be implemented by subclasses
   */
  abstract getMode(): ExecutionMode;

  /**
   * Get provider statistics
   */
  getStats(): ProviderStats {
    const uptime = Date.now() - this.startTime.getTime();
    const averageTaskDuration = this.taskDurations.length > 0
      ? this.taskDurations.reduce((sum, duration) => sum + duration, 0) / this.taskDurations.length
      : 0;

    return {
      mode: this.getMode(),
      totalExecutors: this.getTotalExecutors(),
      activeExecutors: this.getActiveExecutors(),
      idleExecutors: this.getIdleExecutors(),
      tasksCompleted: this.tasksCompleted,
      tasksActive: this.getActiveExecutors(), // Assuming one task per active executor
      averageTaskDuration,
      uptime,
      resourceUsage: this.getResourceUsage()
    };
  }

  /**
   * Check if the provider is healthy
   */
  isHealthy(): boolean {
    return !this.isShuttingDown;
  }

  /**
   * Record task completion for statistics
   */
  protected recordTaskCompletion(duration: number): void {
    this.tasksCompleted++;
    this.taskDurations.push(duration);
    
    // Keep only the last 100 task durations for average calculation
    if (this.taskDurations.length > 100) {
      this.taskDurations.shift();
    }
  }

  /**
   * Abstract methods for statistics - must be implemented by subclasses
   */
  protected abstract getTotalExecutors(): number;
  protected abstract getActiveExecutors(): number;
  protected abstract getIdleExecutors(): number;
  protected abstract getResourceUsage(): {
    totalMemory: number;
    usedMemory: number;
    totalCpu: number;
    usedCpu: number;
  };
}

/**
 * Execution Provider Factory
 * 
 * Creates the appropriate provider based on configuration
 */
export interface ExecutionProviderFactory {
  createProvider(config: WorkerConfig): Promise<ExecutionProvider>;
}

/**
 * Provider configuration interface
 */
export type ProviderConfig = WorkerConfig;

/**
 * Execution Provider Error types
 */
export class ExecutionProviderError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly provider: string,
    public readonly cause?: Error
  ) {
    super(message);
    this.name = 'ExecutionProviderError';
  }
}

export class ExecutorError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly executorId: string,
    public readonly cause?: Error
  ) {
    super(message);
    this.name = 'ExecutorError';
  }
}

/**
 * Common error codes
 */
export const ErrorCodes = {
  PROVIDER_INITIALIZATION_FAILED: 'PROVIDER_INITIALIZATION_FAILED',
  EXECUTOR_CREATION_FAILED: 'EXECUTOR_CREATION_FAILED',
  EXECUTOR_EXECUTION_FAILED: 'EXECUTOR_EXECUTION_FAILED',
  EXECUTOR_TERMINATION_FAILED: 'EXECUTOR_TERMINATION_FAILED',
  PROVIDER_CLEANUP_FAILED: 'PROVIDER_CLEANUP_FAILED',
  RESOURCE_EXHAUSTION: 'RESOURCE_EXHAUSTION',
  CONFIGURATION_ERROR: 'CONFIGURATION_ERROR',
  HEALTH_CHECK_FAILED: 'HEALTH_CHECK_FAILED'
} as const;

export type ErrorCode = typeof ErrorCodes[keyof typeof ErrorCodes];