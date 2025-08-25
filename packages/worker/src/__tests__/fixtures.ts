/**
 * @fileoverview Test fixtures and utilities for ClaudeCluster Worker tests
 * 
 * Provides common test data, mock implementations, and helper functions
 * for testing both process pool and container execution modes.
 */

import { randomUUID } from 'crypto';
import type { 
  Task, 
  TaskResult, 
  TaskProgress, 
  TaskMetrics,
  TaskContext,
  Session
} from '@claudecluster/core';
import { TaskStatus, TaskPriority, TaskCategory } from '@claudecluster/core';
import { ExecutionMode, type Executor, type ExecutionProvider } from '../execution/provider';
import type { WorkerServerConfig } from '../types/config';

// Type alias for backward compatibility
type WorkerConfig = WorkerServerConfig;

/**
 * Default test configuration for both execution modes
 */
export const defaultTestConfig: WorkerConfig = {
  host: 'localhost',
  port: 0, // Let system assign port for tests
  maxConcurrentTasks: 2,
  executionMode: ExecutionMode.PROCESS_POOL,
  sessionTimeout: 60000,
  enableAgenticMode: false,
  enableHealthCheck: true,
  enableMetrics: true,
  requestTimeout: 60000,
  monitoring: {
    enabled: true,
    logging: {
      level: 'error', // Reduce noise in tests
      format: 'text',
      structured: false,
      outputs: []
    }
  }
};

/**
 * Process pool specific test configuration
 */
export const defaultProcessPoolConfig: WorkerConfig = {
  ...defaultTestConfig,
  executionMode: ExecutionMode.PROCESS_POOL,
  processPool: {
    maxProcesses: 2,
    processTimeout: 10000,
    claudeCodePath: 'claude-mock', // Will be mocked in tests
    reuseProcesses: true
  }
};

/**
 * Container specific test configuration  
 */
export const defaultContainerConfig: WorkerConfig = {
  ...defaultTestConfig,
  executionMode: ExecutionMode.CONTAINER_AGENTIC,
  enableAgenticMode: true,
  container: {
    orchestrator: 'docker',
    image: 'claudecluster/worker:test',
    registry: 'localhost:5000',
    resourceLimits: {
      memory: 512 * 1024 * 1024, // 512MB in bytes
      cpu: 0.5,
      timeout: 300 // 5 minutes
    },
    environmentVariables: {
      NODE_ENV: 'test'
    },
    autoRemove: true
  }
};

/**
 * Create a basic test task
 */
export function createTestTask(overrides: Partial<Task> = {}): Task {
  const baseTask: Task = {
    id: randomUUID(),
    title: 'Test Task',
    description: 'A test task for validation',
    category: TaskCategory.TEST,
    priority: TaskPriority.MEDIUM,
    status: TaskStatus.PENDING,
    dependencies: [],
    context: {
      workingDirectory: '/tmp/test',
      timeout: 30000
    },
    createdAt: new Date(),
    updatedAt: new Date()
  };

  return { ...baseTask, ...overrides };
}

/**
 * Create a test task that should succeed
 */
export function createSuccessTask(id?: string): Task {
  return createTestTask({
    id: id || `success-${randomUUID()}`,
    title: 'Success Test Task',
    description: 'A task that should complete successfully',
    context: {
      workingDirectory: '/tmp/test',
      timeout: 10000,
      environment: {
        TEST_MODE: 'success'
      }
    }
  });
}

/**
 * Create a test task that should fail
 */
export function createFailureTask(id?: string): Task {
  return createTestTask({
    id: id || `failure-${randomUUID()}`,
    title: 'Failure Test Task', 
    description: 'A task that should fail',
    context: {
      workingDirectory: '/tmp/test',
      timeout: 10000,
      environment: {
        TEST_MODE: 'failure'
      }
    }
  });
}

/**
 * Create a test task that should timeout
 */
export function createTimeoutTask(id?: string, timeout: number = 1000): Task {
  return createTestTask({
    id: id || `timeout-${randomUUID()}`,
    title: 'Timeout Test Task',
    description: 'A task that should timeout',
    context: {
      workingDirectory: '/tmp/test',
      timeout,
      environment: {
        TEST_MODE: 'timeout'
      }
    }
  });
}

/**
 * Create a test task with specific execution mode
 */
export function createTaskForMode(mode: ExecutionMode, overrides: Partial<Task> = {}): Task {
  const baseOverrides = {
    context: {
      workingDirectory: '/tmp/test',
      timeout: 15000,
      executionMode: mode
    }
  };

  return createTestTask({ ...baseOverrides, ...overrides });
}

/**
 * Create a test task with session requirements (for container mode)
 */
export function createSessionTask(sessionId?: string, overrides: Partial<Task> = {}): Task {
  return createTestTask({
    title: 'Session Test Task',
    description: 'A task requiring session execution',
    context: {
      workingDirectory: '/workspace',
      timeout: 30000,
      executionMode: ExecutionMode.CONTAINER_AGENTIC,
      repoUrl: 'https://github.com/test/repo.git'
    },
    sessionId: sessionId || randomUUID(),
    ...overrides
  });
}

/**
 * Create expected successful task result
 */
export function createSuccessResult(taskId: string): TaskResult {
  return {
    taskId,
    status: TaskStatus.COMPLETED,
    output: 'Task completed successfully',
    artifacts: [],
    logs: ['Task started', 'Task completed successfully'],
    startedAt: new Date(Date.now() - 5000),
    completedAt: new Date(),
    metrics: {
      startTime: new Date(Date.now() - 5000),
      endTime: new Date(),
      duration: 5000,
      cpuUsage: 25.0,
      memoryUsage: 128 * 1024 * 1024 // Convert to bytes
    }
  };
}

/**
 * Create expected failed task result
 */
export function createFailureResult(taskId: string, errorMessage: string = 'Task execution failed'): TaskResult {
  return {
    taskId,
    status: TaskStatus.FAILED,
    error: errorMessage,
    artifacts: [],
    logs: ['Task started', `Task failed: ${errorMessage}`],
    startedAt: new Date(Date.now() - 2000),
    completedAt: new Date(),
    metrics: {
      startTime: new Date(Date.now() - 2000),
      endTime: new Date(),
      duration: 2000,
      cpuUsage: 15.0,
      memoryUsage: 64 * 1024 * 1024 // Convert to bytes
    }
  };
}

/**
 * Create test progress update
 */
export function createProgressUpdate(
  percentage: number = 50,
  currentStep: string = 'Processing',
  totalSteps: number = 3,
  completedSteps: number = 1
): TaskProgress {
  return {
    percentage,
    currentStep,
    totalSteps,
    completedSteps,
    estimatedTimeRemaining: percentage < 100 ? 5000 : undefined
  };
}

/**
 * Mock Executor implementation for testing
 */
export class MockExecutor implements Executor {
  private _isHealthy = true;
  private _state = 'idle' as any;
  private _tasksCompleted = 0;
  private _uptime = 0;
  public readonly id: string;

  constructor(
    id: string = randomUUID(),
    public readonly mode: ExecutionMode = ExecutionMode.PROCESS_POOL,
    private shouldFail = false,
    private shouldTimeout = false,
    private executionDelay = 100
  ) {
    this.id = id;
    this._uptime = Date.now();
  }

  async execute(task: Task): Promise<TaskResult> {
    this._state = 'executing';
    
    // Handle timeout scenarios
    if (this.shouldTimeout || task.context?.environment?.TEST_MODE === 'timeout') {
      const timeout = task.context?.timeout || 1000;
      // Simulate a long-running task that will timeout
      await new Promise(resolve => setTimeout(resolve, timeout + 100));
      throw new Error(`Task ${task.id} timed out after ${timeout}ms`);
    }
    
    // Simulate execution delay
    await new Promise(resolve => setTimeout(resolve, this.executionDelay));
    
    if (this.shouldFail || task.context?.environment?.TEST_MODE === 'failure') {
      this._state = 'idle';
      return createFailureResult(task.id, 'Mock executor failure');
    }
    
    this._state = 'idle';
    this._tasksCompleted++;
    
    const result = createSuccessResult(task.id);
    if (task.sessionId) {
      (result as any).sessionId = task.sessionId;
    }
    
    return result;
  }

  async terminate(): Promise<void> {
    this._state = 'terminated';
    this._isHealthy = false;
  }

  isHealthy(): boolean {
    return this._isHealthy;
  }

  getStatus() {
    return {
      id: this.id,
      mode: this.mode,
      state: this._state,
      uptime: Date.now() - this._uptime,
      tasksCompleted: this._tasksCompleted,
      lastActivity: new Date(),
      resourceUsage: {
        memory: 128,
        cpu: 15.0
      }
    };
  }
}

/**
 * Mock ExecutionProvider implementation for testing
 */
export class MockExecutionProvider implements ExecutionProvider {
  private executors = new Map<string, MockExecutor>();
  private _tasksCompleted = 0;
  private activeExecutions = new Set<string>();

  constructor(
    private mode: ExecutionMode = ExecutionMode.PROCESS_POOL,
    private shouldFail = false,
    private shouldTimeout = false,
    private maxConcurrency = 2
  ) {}

  async getExecutor(task: Task, mode: ExecutionMode): Promise<Executor> {
    // Respect concurrency limits
    while (this.activeExecutions.size >= this.maxConcurrency) {
      await new Promise(resolve => setTimeout(resolve, 50));
    }

    const executorId = `mock-executor-${randomUUID()}`;
    const executor = new MockExecutor(executorId, mode, this.shouldFail, this.shouldTimeout);
    
    // Wrap the original execute method to track active executions
    const originalExecute = executor.execute.bind(executor);
    executor.execute = async (task: Task) => {
      this.activeExecutions.add(task.id);
      try {
        const result = await originalExecute(task);
        return result;
      } finally {
        this.activeExecutions.delete(task.id);
      }
    };

    this.executors.set(executorId, executor);
    return executor;
  }

  async release(executor: Executor): Promise<void> {
    if (executor) {
      await executor.terminate();
      this.executors.delete(executor.id);
      this._tasksCompleted++;
    }
  }

  async cleanup(): Promise<void> {
    const terminatePromises = Array.from(this.executors.values()).map(executor => 
      executor.terminate()
    );
    await Promise.all(terminatePromises);
    this.executors.clear();
    this.activeExecutions.clear();
  }

  getMode(): ExecutionMode {
    return this.mode;
  }

  getStats() {
    return {
      mode: this.mode,
      totalExecutors: this.executors.size,
      activeExecutors: this.activeExecutions.size,
      idleExecutors: this.executors.size - this.activeExecutions.size,
      tasksCompleted: this._tasksCompleted,
      tasksActive: this.activeExecutions.size,
      averageTaskDuration: 5000,
      uptime: 60000,
      resourceUsage: {
        totalMemory: 1024,
        usedMemory: 256,
        totalCpu: 100,
        usedCpu: 25
      }
    };
  }

  isHealthy(): boolean {
    return true;
  }

  // Helper method to get current running tasks for testing
  getRunningTasks(): string[] {
    return Array.from(this.activeExecutions);
  }
}

/**
 * Helper function to create test session
 */
export function createTestSession(overrides: Partial<Session> = {}): Session {
  return {
    id: randomUUID(),
    executor: new MockExecutor(), // Use actual mock executor
    createdAt: Date.now(),
    expiresAt: Date.now() + 3600000, // 1 hour
    repoUrl: 'https://github.com/test/repo.git',
    executionMode: ExecutionMode.CONTAINER_AGENTIC,
    status: 'active',
    metadata: {},
    ...overrides
  };
}

/**
 * Test utilities for assertions
 */
export const TestUtils = {
  /**
   * Assert that a task result indicates success
   */
  assertTaskSuccess(result: TaskResult): void {
    expect(result.status).toBe(TaskStatus.COMPLETED);
    expect(result.error).toBeUndefined();
  },

  /**
   * Assert that a task result indicates failure
   */
  assertTaskFailure(result: TaskResult, expectedError?: string): void {
    expect(result.status).toBe(TaskStatus.FAILED);
    if (expectedError) {
      expect(result.error).toContain(expectedError);
    }
  },

  /**
   * Assert task execution timing is reasonable
   */
  assertExecutionTime(result: TaskResult, minTime: number, maxTime: number): void {
    const duration = result.metrics.duration || 0;
    expect(duration).toBeGreaterThanOrEqual(minTime);
    expect(duration).toBeLessThanOrEqual(maxTime);
  },

  /**
   * Assert task result has required fields
   */
  assertValidTaskResult(result: TaskResult): void {
    expect(result.taskId).toBeDefined();
    expect(result.status).toBeDefined();
    expect(result.artifacts).toBeDefined();
    expect(result.logs).toBeDefined();
    expect(result.metrics).toBeDefined();
    expect(result.metrics.duration).toBeGreaterThanOrEqual(0);
    expect(result.startedAt).toBeInstanceOf(Date);
    if (result.completedAt) {
      expect(result.completedAt).toBeInstanceOf(Date);
    }
  },

  /**
   * Wait for a condition to be true
   */
  async waitFor(condition: () => boolean | Promise<boolean>, timeout: number = 5000): Promise<void> {
    const start = Date.now();
    while (Date.now() - start < timeout) {
      if (await condition()) {
        return;
      }
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    throw new Error(`Condition not met within ${timeout}ms`);
  }
};

/**
 * Test environment setup utilities
 */
export const TestEnvironment = {
  /**
   * Set up test environment for execution mode
   */
  async setupForMode(mode: ExecutionMode): Promise<WorkerConfig> {
    return mode === ExecutionMode.PROCESS_POOL 
      ? { ...defaultProcessPoolConfig }
      : { ...defaultContainerConfig };
  },

  /**
   * Clean up test environment
   */
  async cleanup(): Promise<void> {
    // Cleanup any test artifacts
    // This would clean up temporary directories, mock resources, etc.
  }
};