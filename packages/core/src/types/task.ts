/**
 * @fileoverview Task system types for ClaudeCluster
 */

import { z } from 'zod';
import { ExecutionMode, ExecutionModeSchema } from '../config/execution';

/**
 * Task status enumeration
 */
export enum TaskStatus {
  PENDING = 'pending',
  RUNNING = 'running', 
  COMPLETED = 'completed',
  FAILED = 'failed',
  CANCELLED = 'cancelled',
  PAUSED = 'paused'
}

/**
 * Task priority levels
 */
export enum TaskPriority {
  LOW = 'low',
  MEDIUM = 'medium', 
  HIGH = 'high',
  CRITICAL = 'critical'
}

/**
 * Task category types
 */
export enum TaskCategory {
  CODE = 'code',
  TEST = 'test',
  REFACTOR = 'refactor',
  ANALYZE = 'analyze',
  DOCUMENT = 'document',
  DEBUG = 'debug',
  OPTIMIZE = 'optimize'
}

/**
 * Task execution metrics
 */
export interface TaskMetrics {
  readonly startTime?: Date;
  readonly endTime?: Date;
  readonly duration?: number; // milliseconds
  readonly cpuUsage?: number; // percentage
  readonly memoryUsage?: number; // bytes
  readonly linesOfCodeProcessed?: number;
  readonly filesModified?: number;
  readonly errorCount?: number;
}

/**
 * Task artifact representing generated output
 */
export interface TaskArtifact {
  readonly id: string;
  readonly type: 'file' | 'directory' | 'report' | 'log' | 'data';
  readonly name: string;
  readonly path: string;
  readonly size?: number; // bytes
  readonly checksum?: string;
  readonly createdAt: Date;
  readonly metadata?: Record<string, unknown>;
}

/**
 * Session configuration options for task execution
 */
export interface SessionOptions {
  readonly repoUrl?: string;
  readonly timeout?: number; // in seconds
  readonly resourceLimits?: {
    readonly memory?: number; // in bytes
    readonly cpu?: number; // CPU shares or cores
  };
  readonly environment?: Record<string, string>;
  readonly workingDirectory?: string;
  readonly executionMode?: ExecutionMode;
}

/**
 * Session information for task execution tracking
 */
export interface Session {
  readonly id: string;
  readonly executor: unknown; // ContainerExecutor or ProcessExecutor - kept generic to avoid circular deps
  readonly createdAt: number; // timestamp
  readonly expiresAt: number; // timestamp  
  readonly repoUrl?: string;
  readonly executionMode: ExecutionMode;
  readonly status: 'initializing' | 'active' | 'idle' | 'terminating' | 'terminated' | 'error';
  readonly metadata?: Record<string, unknown>;
}

/**
 * Utility type to create TaskContext from SessionOptions
 */
export type TaskContextFromSession = Omit<TaskContext, 'workingDirectory'> & {
  readonly sessionOptions?: SessionOptions;
  readonly sessionId?: string;
};

/**
 * Task execution context and configuration
 */
export interface TaskContext {
  readonly workingDirectory: string;
  readonly timeout?: number; // milliseconds
  readonly retryCount?: number;
  readonly environment?: Record<string, string>;
  readonly resourceLimits?: {
    maxMemoryMB?: number;
    maxCpuPercent?: number;
    maxDurationMinutes?: number;
  };
  readonly executionMode?: ExecutionMode;
  readonly repoUrl?: string;
  readonly commands?: string[];
}

/**
 * Task progress information
 */
export interface TaskProgress {
  readonly percentage: number; // 0-100
  readonly currentStep?: string;
  readonly totalSteps?: number;
  readonly completedSteps?: number;
  readonly estimatedTimeRemaining?: number; // milliseconds
  readonly message?: string;
}

/**
 * Task execution result
 */
export interface TaskResult {
  readonly taskId: string;
  readonly status: TaskStatus;
  readonly output?: string;
  readonly error?: string;
  readonly artifacts: readonly TaskArtifact[];
  readonly metrics: TaskMetrics;
  readonly logs: readonly string[];
  readonly exitCode?: number;
  readonly startedAt: Date;
  readonly completedAt?: Date;
  readonly sessionId?: string;
}

/**
 * Core task interface
 */
export interface Task {
  readonly id: string;
  readonly title: string;
  readonly description: string;
  readonly category: TaskCategory;
  readonly priority: TaskPriority;
  readonly status: TaskStatus;
  readonly dependencies: readonly string[]; // Task IDs
  readonly context: TaskContext;
  readonly progress?: TaskProgress;
  readonly result?: TaskResult;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly assignedWorkerId?: string;
  readonly estimatedDurationMinutes?: number;
  readonly tags?: readonly string[];
  readonly metadata?: Record<string, unknown>;
  readonly sessionId?: string;
}

/**
 * Task creation input
 */
export interface CreateTaskInput {
  readonly title: string;
  readonly description: string;
  readonly category: TaskCategory;
  readonly priority?: TaskPriority;
  readonly dependencies?: readonly string[];
  readonly context: Omit<TaskContext, 'workingDirectory'> & { workingDirectory?: string };
  readonly estimatedDurationMinutes?: number;
  readonly tags?: readonly string[];
  readonly metadata?: Record<string, unknown>;
}

/**
 * Task update input
 */
export interface UpdateTaskInput {
  readonly title?: string;
  readonly description?: string;
  readonly priority?: TaskPriority;
  readonly status?: TaskStatus;
  readonly progress?: TaskProgress;
  readonly assignedWorkerId?: string;
  readonly metadata?: Record<string, unknown>;
}

/**
 * Task creation input with session support
 */
export interface CreateSessionTaskInput extends Omit<CreateTaskInput, 'context'> {
  readonly sessionOptions: SessionOptions;
  readonly workingDirectory?: string;
}

/**
 * Utility functions for session-task integration
 */
export namespace TaskSessionHelpers {
  /**
   * Create TaskContext from SessionOptions
   */
  export function createTaskContextFromSession(
    sessionOptions: SessionOptions, 
    workingDirectory: string,
    sessionId?: string
  ): TaskContext & { sessionId?: string } {
    return {
      workingDirectory,
      timeout: sessionOptions.timeout ? sessionOptions.timeout * 1000 : undefined, // convert seconds to milliseconds
      environment: sessionOptions.environment,
      executionMode: sessionOptions.executionMode,
      repoUrl: sessionOptions.repoUrl,
      resourceLimits: sessionOptions.resourceLimits ? {
        maxMemoryMB: sessionOptions.resourceLimits.memory ? Math.round(sessionOptions.resourceLimits.memory / (1024 * 1024)) : undefined,
        maxCpuPercent: sessionOptions.resourceLimits.cpu ? Math.round(sessionOptions.resourceLimits.cpu) : undefined,
      } : undefined,
      sessionId
    };
  }
}

/**
 * Task filter criteria
 */
export interface TaskFilter {
  readonly status?: TaskStatus | readonly TaskStatus[];
  readonly category?: TaskCategory | readonly TaskCategory[];
  readonly priority?: TaskPriority | readonly TaskPriority[];
  readonly assignedWorkerId?: string;
  readonly tags?: readonly string[];
  readonly createdAfter?: Date;
  readonly createdBefore?: Date;
  readonly hasArtifacts?: boolean;
}

/**
 * Task sort options
 */
export interface TaskSortOptions {
  readonly field: 'createdAt' | 'updatedAt' | 'priority' | 'estimatedDuration';
  readonly direction: 'asc' | 'desc';
}

/**
 * Task query options
 */
export interface TaskQueryOptions {
  readonly filter?: TaskFilter;
  readonly sort?: TaskSortOptions;
  readonly limit?: number;
  readonly offset?: number;
}

/**
 * Zod schemas for runtime validation
 */
export const TaskStatusSchema = z.nativeEnum(TaskStatus);
export const TaskPrioritySchema = z.nativeEnum(TaskPriority);
export const TaskCategorySchema = z.nativeEnum(TaskCategory);

export const TaskMetricsSchema = z.object({
  startTime: z.date().optional(),
  endTime: z.date().optional(),
  duration: z.number().positive().optional(),
  cpuUsage: z.number().min(0).max(100).optional(),
  memoryUsage: z.number().positive().optional(),
  linesOfCodeProcessed: z.number().nonnegative().optional(),
  filesModified: z.number().nonnegative().optional(),
  errorCount: z.number().nonnegative().optional()
});

export const TaskArtifactSchema = z.object({
  id: z.string().min(1),
  type: z.enum(['file', 'directory', 'report', 'log', 'data']),
  name: z.string().min(1),
  path: z.string().min(1),
  size: z.number().nonnegative().optional(),
  checksum: z.string().optional(),
  createdAt: z.date(),
  metadata: z.record(z.unknown()).optional()
});

export const SessionOptionsSchema = z.object({
  repoUrl: z.string().optional(),
  timeout: z.number().positive().optional(),
  resourceLimits: z.object({
    memory: z.number().positive().optional(),
    cpu: z.number().positive().optional()
  }).optional(),
  environment: z.record(z.string()).optional(),
  workingDirectory: z.string().optional(),
  executionMode: ExecutionModeSchema.optional()
});

export const SessionSchema = z.object({
  id: z.string().min(1),
  executor: z.unknown().refine(val => val !== undefined, { message: "Executor is required" }), // Generic executor interface - must not be undefined
  createdAt: z.number().positive(),
  expiresAt: z.number().positive(),
  repoUrl: z.string().optional(),
  executionMode: ExecutionModeSchema,
  status: z.enum(['initializing', 'active', 'idle', 'terminating', 'terminated', 'error']),
  metadata: z.record(z.unknown()).optional()
});

export const TaskContextSchema = z.object({
  workingDirectory: z.string().min(1),
  timeout: z.number().positive().optional(),
  retryCount: z.number().nonnegative().optional(),
  environment: z.record(z.string()).optional(),
  resourceLimits: z.object({
    maxMemoryMB: z.number().positive().optional(),
    maxCpuPercent: z.number().min(1).max(100).optional(),
    maxDurationMinutes: z.number().positive().optional()
  }).optional(),
  executionMode: ExecutionModeSchema.optional(),
  repoUrl: z.string().optional(),
  commands: z.array(z.string()).optional()
});

export const TaskProgressSchema = z.object({
  percentage: z.number().min(0).max(100),
  currentStep: z.string().optional(),
  totalSteps: z.number().positive().optional(),
  completedSteps: z.number().nonnegative().optional(),
  estimatedTimeRemaining: z.number().positive().optional(),
  message: z.string().optional()
});

export const CreateSessionTaskInputSchema = z.object({
  title: z.string().min(1),
  description: z.string(),
  category: TaskCategorySchema,
  priority: TaskPrioritySchema.optional(),
  dependencies: z.array(z.string()).optional(),
  sessionOptions: SessionOptionsSchema,
  workingDirectory: z.string().optional(),
  estimatedDurationMinutes: z.number().positive().optional(),
  tags: z.array(z.string()).optional(),
  metadata: z.record(z.unknown()).optional()
});

export const TaskSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  description: z.string(),
  category: TaskCategorySchema,
  priority: TaskPrioritySchema,
  status: TaskStatusSchema,
  dependencies: z.array(z.string()),
  context: TaskContextSchema,
  progress: TaskProgressSchema.optional(),
  result: z.object({
    taskId: z.string(),
    status: TaskStatusSchema,
    output: z.string().optional(),
    error: z.string().optional(),
    artifacts: z.array(TaskArtifactSchema),
    metrics: TaskMetricsSchema,
    logs: z.array(z.string()),
    exitCode: z.number().optional(),
    startedAt: z.date(),
    completedAt: z.date().optional(),
    sessionId: z.string().optional()
  }).optional(),
  createdAt: z.date(),
  updatedAt: z.date(),
  assignedWorkerId: z.string().optional(),
  estimatedDurationMinutes: z.number().positive().optional(),
  tags: z.array(z.string()).optional(),
  metadata: z.record(z.unknown()).optional(),
  sessionId: z.string().optional()
});

/**
 * Serialization/Deserialization utilities for Task model
 */
export namespace TaskSerialization {
  /**
   * Serialize a Task to JSON-safe format
   */
  export function serializeTask(task: Task): Record<string, unknown> {
    return {
      ...task,
      createdAt: task.createdAt.toISOString(),
      updatedAt: task.updatedAt.toISOString(),
      result: task.result ? {
        ...task.result,
        startedAt: task.result.startedAt.toISOString(),
        completedAt: task.result.completedAt?.toISOString(),
        artifacts: task.result.artifacts.map(artifact => ({
          ...artifact,
          createdAt: artifact.createdAt.toISOString()
        })),
        metrics: task.result.metrics.startTime || task.result.metrics.endTime ? {
          ...task.result.metrics,
          startTime: task.result.metrics.startTime?.toISOString(),
          endTime: task.result.metrics.endTime?.toISOString()
        } : task.result.metrics
      } : undefined
    };
  }

  /**
   * Deserialize a Task from JSON format with validation
   */
  export function deserializeTask(data: unknown): Task {
    // Convert string dates back to Date objects
    const processedData = typeof data === 'object' && data !== null ? {
      ...data as Record<string, unknown>,
      createdAt: typeof (data as Record<string, unknown>)['createdAt'] === 'string' 
        ? new Date((data as Record<string, unknown>)['createdAt'] as string)
        : (data as Record<string, unknown>)['createdAt'],
      updatedAt: typeof (data as Record<string, unknown>)['updatedAt'] === 'string'
        ? new Date((data as Record<string, unknown>)['updatedAt'] as string)
        : (data as Record<string, unknown>)['updatedAt'],
      result: (data as Record<string, unknown>)['result'] ? processTaskResult((data as Record<string, unknown>)['result']) : undefined
    } : data;

    // Validate using Zod schema
    return TaskSchema.parse(processedData);
  }

  /**
   * Serialize SessionOptions to JSON-safe format
   */
  export function serializeSessionOptions(sessionOptions: SessionOptions): Record<string, unknown> {
    return SessionOptionsSchema.parse(sessionOptions);
  }

  /**
   * Deserialize SessionOptions from JSON format with validation
   */
  export function deserializeSessionOptions(data: unknown): SessionOptions {
    return SessionOptionsSchema.parse(data);
  }

  /**
   * Serialize Session to JSON-safe format
   */
  export function serializeSession(session: Session): Record<string, unknown> {
    return {
      id: session.id,
      executor: session.executor, // Note: executor is kept as unknown to avoid circular dependencies
      createdAt: session.createdAt,
      expiresAt: session.expiresAt,
      repoUrl: session.repoUrl,
      executionMode: session.executionMode,
      status: session.status,
      metadata: session.metadata
    };
  }

  /**
   * Deserialize Session from JSON format with validation
   */
  export function deserializeSession(data: unknown): Session {
    // The SessionSchema will handle the validation and ensure executor is present
    return SessionSchema.parse(data) as Session;
  }

  /**
   * Batch serialize multiple tasks
   */
  export function serializeTasks(tasks: readonly Task[]): Record<string, unknown>[] {
    return tasks.map(serializeTask);
  }

  /**
   * Batch deserialize multiple tasks
   */
  export function deserializeTasks(data: unknown[]): Task[] {
    return data.map(deserializeTask);
  }

  /**
   * Helper function to process TaskResult during deserialization
   */
  function processTaskResult(result: unknown): unknown {
    if (typeof result !== 'object' || result === null) return result;
    
    const resultData = result as Record<string, unknown>;
    return {
      ...resultData,
      startedAt: typeof resultData['startedAt'] === 'string' 
        ? new Date(resultData['startedAt'] as string) 
        : resultData['startedAt'],
      completedAt: typeof resultData['completedAt'] === 'string'
        ? new Date(resultData['completedAt'] as string)
        : resultData['completedAt'],
      artifacts: Array.isArray(resultData['artifacts'])
        ? resultData['artifacts'].map((artifact: unknown) => {
            if (typeof artifact !== 'object' || artifact === null) return artifact;
            const artifactData = artifact as Record<string, unknown>;
            return {
              ...artifactData,
              createdAt: typeof artifactData['createdAt'] === 'string'
                ? new Date(artifactData['createdAt'] as string)
                : artifactData['createdAt']
            };
          })
        : resultData['artifacts'],
      metrics: resultData['metrics'] && typeof resultData['metrics'] === 'object' ? {
        ...(resultData['metrics'] as Record<string, unknown>),
        startTime: typeof (resultData['metrics'] as Record<string, unknown>)['startTime'] === 'string'
          ? new Date((resultData['metrics'] as Record<string, unknown>)['startTime'] as string)
          : (resultData['metrics'] as Record<string, unknown>)['startTime'],
        endTime: typeof (resultData['metrics'] as Record<string, unknown>)['endTime'] === 'string'
          ? new Date((resultData['metrics'] as Record<string, unknown>)['endTime'] as string)
          : (resultData['metrics'] as Record<string, unknown>)['endTime']
      } : resultData['metrics']
    };
  }
}

// Re-export ExecutionMode and ExecutionModeSchema from config for convenience
export { ExecutionMode, ExecutionModeSchema };