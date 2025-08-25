/**
 * @fileoverview Unified Execution Provider Implementation
 * 
 * Provides a unified interface that can route execution requests to either
 * ProcessPoolProvider or ContainerProvider based on configuration.
 */

import {
  ExecutionProvider,
  Executor,
  ExecutionMode,
  ProviderStats,
  ExecutionProviderError,
  ErrorCodes
} from './provider.js';
import { ProcessPoolProvider, ProcessExecutor } from './process-pool-provider.js';
import { ContainerProvider, ContainerExecutor } from './container-provider.js';
import type { Task, TaskResult, WorkerConfig } from '@claudecluster/core';

/**
 * Feature flags for execution mode control
 */
export interface ExecutionFeatureFlags {
  enableContainerMode: boolean;
  defaultExecutionMode: ExecutionMode;
  allowModeOverride: boolean;
  containerProviders: string[];
}

/**
 * Unified Execution Provider
 * 
 * Acts as a facade that routes execution requests to the appropriate
 * provider based on configuration and task requirements.
 */
export class UnifiedExecutionProvider implements ExecutionProvider {
  private processPoolProvider?: ProcessPoolProvider;
  private containerProvider?: ContainerProvider;
  private readonly startTime: Date;
  private isShuttingDown = false;

  constructor(private config: WorkerConfig) {
    this.startTime = new Date();
    this.initializeProviders();
  }

  /**
   * Initialize providers based on configuration
   */
  private initializeProviders(): void {
    const executionMode = this.config.executionMode;
    const featureFlags = this.config.featureFlags;

    // Always initialize process pool as fallback unless explicitly disabled
    if (executionMode === ExecutionMode.PROCESS_POOL || 
        featureFlags?.allowModeOverride !== false) {
      try {
        this.processPoolProvider = new ProcessPoolProvider(this.config);
      } catch (error) {
        console.warn('Failed to initialize ProcessPoolProvider:', error);
        // Continue without process pool if initialization fails
      }
    }

    // Initialize container provider if enabled
    if (executionMode === ExecutionMode.CONTAINER_AGENTIC || 
        featureFlags?.enableContainerMode) {
      try {
        this.containerProvider = new ContainerProvider(this.config);
      } catch (error) {
        console.warn('Failed to initialize ContainerProvider:', error);
        // Continue without container provider if initialization fails
      }
    }

    // Validate that at least one provider is available
    if (!this.processPoolProvider && !this.containerProvider) {
      throw new ExecutionProviderError(
        'No execution providers could be initialized',
        ErrorCodes.PROVIDER_INITIALIZATION_FAILED,
        'UnifiedExecutionProvider'
      );
    }
  }

  /**
   * Get an executor for task execution
   */
  async getExecutor(task: Task, mode: ExecutionMode): Promise<Executor> {
    if (this.isShuttingDown) {
      throw new ExecutionProviderError(
        'Provider is shutting down',
        ErrorCodes.PROVIDER_INITIALIZATION_FAILED,
        'UnifiedExecutionProvider'
      );
    }

    // Determine the execution mode to use
    const targetMode = this.determineExecutionMode(task, mode);
    const provider = this.getProviderForMode(targetMode);

    if (!provider) {
      throw new ExecutionProviderError(
        `No provider available for execution mode: ${targetMode}`,
        ErrorCodes.EXECUTOR_CREATION_FAILED,
        'UnifiedExecutionProvider'
      );
    }

    try {
      return await provider.getExecutor(task, targetMode);
    } catch (error) {
      // If the primary provider fails and fallback is enabled, try the other provider
      if (this.config.featureFlags?.allowModeOverride && this.shouldFallback(targetMode, error)) {
        const fallbackMode = targetMode === ExecutionMode.PROCESS_POOL 
          ? ExecutionMode.CONTAINER_AGENTIC 
          : ExecutionMode.PROCESS_POOL;
        
        const fallbackProvider = this.getProviderForMode(fallbackMode);
        if (fallbackProvider) {
          console.warn(`Falling back from ${targetMode} to ${fallbackMode}:`, error);
          return await fallbackProvider.getExecutor(task, fallbackMode);
        }
      }
      
      throw error;
    }
  }

  /**
   * Release an executor back to the appropriate provider
   */
  async release(executor: Executor): Promise<void> {
    const provider = this.getProviderForExecutor(executor);
    
    if (!provider) {
      throw new ExecutionProviderError(
        'No provider found for executor type',
        ErrorCodes.EXECUTOR_TERMINATION_FAILED,
        'UnifiedExecutionProvider'
      );
    }

    return await provider.release(executor);
  }

  /**
   * Clean up all providers and resources
   */
  async cleanup(): Promise<void> {
    this.isShuttingDown = true;

    const cleanupPromises: Promise<void>[] = [];

    if (this.processPoolProvider) {
      cleanupPromises.push(
        this.processPoolProvider.cleanup().catch(error => {
          console.error('Failed to cleanup ProcessPoolProvider:', error);
        })
      );
    }

    if (this.containerProvider) {
      cleanupPromises.push(
        this.containerProvider.cleanup().catch(error => {
          console.error('Failed to cleanup ContainerProvider:', error);
        })
      );
    }

    await Promise.allSettled(cleanupPromises);
  }

  /**
   * Get the current execution mode (returns the default configured mode)
   */
  getMode(): ExecutionMode {
    return this.config.executionMode;
  }

  /**
   * Get aggregated statistics from all providers
   */
  getStats(): ProviderStats {
    const uptime = Date.now() - this.startTime.getTime();
    
    // Aggregate stats from active providers
    const processStats = this.processPoolProvider?.getStats();
    const containerStats = this.containerProvider?.getStats();
    
    // Combine stats
    const totalExecutors = (processStats?.totalExecutors || 0) + (containerStats?.totalExecutors || 0);
    const activeExecutors = (processStats?.activeExecutors || 0) + (containerStats?.activeExecutors || 0);
    const idleExecutors = (processStats?.idleExecutors || 0) + (containerStats?.idleExecutors || 0);
    const tasksCompleted = (processStats?.tasksCompleted || 0) + (containerStats?.tasksCompleted || 0);
    const tasksActive = (processStats?.tasksActive || 0) + (containerStats?.tasksActive || 0);
    
    // Calculate weighted average task duration
    const avgDuration1 = processStats?.averageTaskDuration || 0;
    const avgDuration2 = containerStats?.averageTaskDuration || 0;
    const weight1 = processStats?.tasksCompleted || 0;
    const weight2 = containerStats?.tasksCompleted || 0;
    const totalWeight = weight1 + weight2;
    const averageTaskDuration = totalWeight > 0 
      ? ((avgDuration1 * weight1) + (avgDuration2 * weight2)) / totalWeight 
      : 0;

    // Combine resource usage
    const totalMemory = (processStats?.resourceUsage.totalMemory || 0) + (containerStats?.resourceUsage.totalMemory || 0);
    const usedMemory = (processStats?.resourceUsage.usedMemory || 0) + (containerStats?.resourceUsage.usedMemory || 0);
    const totalCpu = (processStats?.resourceUsage.totalCpu || 0) + (containerStats?.resourceUsage.totalCpu || 0);
    const usedCpu = (processStats?.resourceUsage.usedCpu || 0) + (containerStats?.resourceUsage.usedCpu || 0);

    return {
      mode: this.getMode(),
      totalExecutors,
      activeExecutors,
      idleExecutors,
      tasksCompleted,
      tasksActive,
      averageTaskDuration,
      uptime,
      resourceUsage: {
        totalMemory,
        usedMemory,
        totalCpu,
        usedCpu
      }
    };
  }

  /**
   * Check if the provider is healthy
   */
  isHealthy(): boolean {
    if (this.isShuttingDown) {
      return false;
    }

    // Provider is healthy if at least one sub-provider is healthy
    const processHealthy = this.processPoolProvider?.isHealthy() || false;
    const containerHealthy = this.containerProvider?.isHealthy() || false;
    
    return processHealthy || containerHealthy;
  }

  /**
   * Determine which execution mode to use for a task
   */
  private determineExecutionMode(task: Task, requestedMode: ExecutionMode): ExecutionMode {
    // 1. Check if task specifies a preferred execution mode
    if (task.context?.executionMode) {
      const taskMode = task.context.executionMode as ExecutionMode;
      if (this.isExecutionModeSupported(taskMode)) {
        return taskMode;
      }
    }

    // 2. Use the explicitly requested mode if supported
    if (this.isExecutionModeSupported(requestedMode)) {
      return requestedMode;
    }

    // 3. Use the configured default mode
    if (this.isExecutionModeSupported(this.config.executionMode)) {
      return this.config.executionMode;
    }

    // 4. Fallback to any available mode
    if (this.containerProvider) {
      return ExecutionMode.CONTAINER_AGENTIC;
    }
    
    if (this.processPoolProvider) {
      return ExecutionMode.PROCESS_POOL;
    }

    throw new ExecutionProviderError(
      'No execution mode available',
      ErrorCodes.EXECUTOR_CREATION_FAILED,
      'UnifiedExecutionProvider'
    );
  }

  /**
   * Check if an execution mode is supported
   */
  private isExecutionModeSupported(mode: ExecutionMode): boolean {
    switch (mode) {
      case ExecutionMode.PROCESS_POOL:
        return this.processPoolProvider !== undefined;
      case ExecutionMode.CONTAINER_AGENTIC:
        return this.containerProvider !== undefined;
      default:
        return false;
    }
  }

  /**
   * Get the appropriate provider for an execution mode
   */
  private getProviderForMode(mode: ExecutionMode): ExecutionProvider | undefined {
    switch (mode) {
      case ExecutionMode.PROCESS_POOL:
        return this.processPoolProvider;
      case ExecutionMode.CONTAINER_AGENTIC:
        return this.containerProvider;
      default:
        return undefined;
    }
  }

  /**
   * Get the provider that manages a specific executor
   */
  private getProviderForExecutor(executor: Executor): ExecutionProvider | undefined {
    if (executor instanceof ProcessExecutor && this.processPoolProvider) {
      return this.processPoolProvider;
    }
    
    if (executor instanceof ContainerExecutor && this.containerProvider) {
      return this.containerProvider;
    }

    return undefined;
  }

  /**
   * Determine if we should fallback to another provider on error
   */
  private shouldFallback(mode: ExecutionMode, error: unknown): boolean {
    // Don't fallback on configuration errors or shutdown
    if (error instanceof ExecutionProviderError) {
      if (error.code === ErrorCodes.CONFIGURATION_ERROR ||
          error.code === ErrorCodes.PROVIDER_CLEANUP_FAILED) {
        return false;
      }
    }

    // Fallback on resource exhaustion or temporary failures
    return true;
  }

  /**
   * Get process pool provider (for testing or advanced usage)
   */
  getProcessPoolProvider(): ProcessPoolProvider | undefined {
    return this.processPoolProvider;
  }

  /**
   * Get container provider (for testing or advanced usage)
   */
  getContainerProvider(): ContainerProvider | undefined {
    return this.containerProvider;
  }

  /**
   * Get supported execution modes
   */
  getSupportedModes(): ExecutionMode[] {
    const modes: ExecutionMode[] = [];
    
    if (this.processPoolProvider) {
      modes.push(ExecutionMode.PROCESS_POOL);
    }
    
    if (this.containerProvider) {
      modes.push(ExecutionMode.CONTAINER_AGENTIC);
    }
    
    return modes;
  }
}

export default UnifiedExecutionProvider;