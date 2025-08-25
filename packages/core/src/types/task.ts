/**
 * @fileoverview Task system types for ClaudeCluster
 */

import { z } from 'zod';

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

export const TaskContextSchema = z.object({
  workingDirectory: z.string().min(1),
  timeout: z.number().positive().optional(),
  retryCount: z.number().nonnegative().optional(),
  environment: z.record(z.string()).optional(),
  resourceLimits: z.object({
    maxMemoryMB: z.number().positive().optional(),
    maxCpuPercent: z.number().min(1).max(100).optional(),
    maxDurationMinutes: z.number().positive().optional()
  }).optional()
});

export const TaskProgressSchema = z.object({
  percentage: z.number().min(0).max(100),
  currentStep: z.string().optional(),
  totalSteps: z.number().positive().optional(),
  completedSteps: z.number().nonnegative().optional(),
  estimatedTimeRemaining: z.number().positive().optional(),
  message: z.string().optional()
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
    completedAt: z.date().optional()
  }).optional(),
  createdAt: z.date(),
  updatedAt: z.date(),
  assignedWorkerId: z.string().optional(),
  estimatedDurationMinutes: z.number().positive().optional(),
  tags: z.array(z.string()).optional(),
  metadata: z.record(z.unknown()).optional()
});