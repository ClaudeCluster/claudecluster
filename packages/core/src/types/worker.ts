/**
 * @fileoverview Worker management types for ClaudeCluster
 */

import { z } from 'zod';
import { TaskCategory, TaskPriority } from './task.js';

/**
 * Worker status enumeration
 */
export enum WorkerStatus {
  IDLE = 'idle',
  BUSY = 'busy', 
  ERROR = 'error',
  OFFLINE = 'offline',
  STARTING = 'starting',
  STOPPING = 'stopping',
  MAINTENANCE = 'maintenance'
}

/**
 * Worker resource information
 */
export interface WorkerResources {
  readonly cpuCores: number;
  readonly memoryMB: number;
  readonly diskSpaceGB: number;
  readonly currentCpuUsage: number; // percentage
  readonly currentMemoryUsage: number; // MB
  readonly currentDiskUsage: number; // GB
}

/**
 * Worker capabilities and supported operations
 */
export interface WorkerCapabilities {
  readonly supportedCategories: readonly TaskCategory[];
  readonly maxConcurrentTasks: number;
  readonly supportsStreaming: boolean;
  readonly supportsFileOperations: boolean;
  readonly supportsNetworking: boolean;
  readonly claudeCodeVersion?: string;
  readonly nodeVersion: string;
  readonly operatingSystem: string;
  readonly architecture: string;
  readonly customCapabilities?: Record<string, boolean>;
  readonly executionModes?: readonly string[];
  readonly defaultExecutionMode?: string;
  readonly supportsAgenticMode?: boolean;
  readonly supportsContainerExecution?: boolean;
  readonly sessionTimeout?: number;
  readonly containerImage?: string;
}

/**
 * Worker health status information
 */
export interface WorkerHealth {
  readonly isHealthy: boolean;
  readonly lastHealthCheck: Date;
  readonly uptime: number; // milliseconds
  readonly responseTime: number; // milliseconds
  readonly errorRate: number; // percentage over last hour
  readonly memoryLeaks: boolean;
  readonly diskSpace: 'low' | 'medium' | 'high';
  readonly issues?: readonly string[];
}

/**
 * Worker performance metrics
 */
export interface WorkerMetrics {
  readonly totalTasksCompleted: number;
  readonly totalTasksFailed: number;
  readonly averageTaskDuration: number; // milliseconds
  readonly successRate: number; // percentage
  readonly throughputPerHour: number;
  readonly peakMemoryUsage: number; // MB
  readonly peakCpuUsage: number; // percentage
  readonly startTime: Date;
  readonly lastTaskCompletedAt?: Date;
}

/**
 * Worker configuration settings
 */
export interface WorkerConfig {
  readonly id: string;
  readonly name: string;
  readonly endpoint: string; // HTTP/WebSocket URL
  readonly apiKey?: string;
  readonly timeout: number; // milliseconds
  readonly retryAttempts: number;
  readonly healthCheckInterval: number; // milliseconds
  readonly maxIdleTime: number; // milliseconds
  readonly environment?: Record<string, string>;
  readonly tags?: readonly string[];
  readonly executionMode?: string;
  readonly featureFlags?: Record<string, boolean>;
  readonly processPool?: {
    maxSize: number;
    minSize: number;
    idleTimeout: number;
  };
  readonly container?: {
    image: string;
    registry?: string;
    networkName: string;
    resourceLimits: {
      memory: number;
      cpu: number;
    };
  };
  readonly workspaceDir?: string;
  readonly sessionId?: string;
}

/**
 * Worker task assignment information
 */
export interface WorkerTaskAssignment {
  readonly taskId: string;
  readonly assignedAt: Date;
  readonly startedAt?: Date;
  readonly priority: TaskPriority;
  readonly estimatedDuration?: number; // milliseconds
}

/**
 * Core worker interface
 */
export interface Worker {
  readonly id: string;
  readonly name: string;
  readonly status: WorkerStatus;
  readonly endpoint: string;
  readonly capabilities: WorkerCapabilities;
  readonly resources: WorkerResources;
  readonly health: WorkerHealth;
  readonly metrics: WorkerMetrics;
  readonly config: WorkerConfig;
  readonly currentTasks: readonly WorkerTaskAssignment[];
  readonly createdAt: Date;
  readonly lastSeenAt: Date;
  readonly version: string;
  readonly metadata?: Record<string, unknown>;
}

/**
 * Worker registration input
 */
export interface RegisterWorkerInput {
  readonly name: string;
  readonly endpoint: string;
  readonly capabilities: WorkerCapabilities;
  readonly resources: WorkerResources;
  readonly config?: Partial<WorkerConfig>;
  readonly metadata?: Record<string, unknown>;
}

/**
 * Worker update input
 */
export interface UpdateWorkerInput {
  readonly name?: string;
  readonly status?: WorkerStatus;
  readonly resources?: Partial<WorkerResources>;
  readonly config?: Partial<WorkerConfig>;
  readonly metadata?: Record<string, unknown>;
}

/**
 * Worker filter criteria
 */
export interface WorkerFilter {
  readonly status?: WorkerStatus | readonly WorkerStatus[];
  readonly supportedCategories?: readonly TaskCategory[];
  readonly minAvailableMemory?: number; // MB
  readonly minAvailableCpu?: number; // percentage
  readonly isHealthy?: boolean;
  readonly tags?: readonly string[];
  readonly hasCapacity?: boolean; // can accept more tasks
  readonly lastSeenAfter?: Date;
}

/**
 * Worker selection criteria for task assignment
 */
export interface WorkerSelectionCriteria {
  readonly requiredCategories: readonly TaskCategory[];
  readonly minimumResources?: {
    cpu?: number; // percentage
    memory?: number; // MB
    disk?: number; // GB
  };
  readonly preferredTags?: readonly string[];
  readonly excludeWorkerIds?: readonly string[];
  readonly maxResponseTime?: number; // milliseconds
  readonly requiresStreaming?: boolean;
  readonly requiresFileOperations?: boolean;
}

/**
 * Worker pool statistics
 */
export interface WorkerPoolStats {
  readonly totalWorkers: number;
  readonly activeWorkers: number;
  readonly idleWorkers: number;
  readonly busyWorkers: number;
  readonly offlineWorkers: number;
  readonly errorWorkers: number;
  readonly totalCapacity: number; // max concurrent tasks across all workers
  readonly currentLoad: number; // current tasks / total capacity
  readonly averageResponseTime: number; // milliseconds
  readonly totalThroughput: number; // tasks per hour
}

/**
 * Zod schemas for runtime validation
 */
export const WorkerStatusSchema = z.nativeEnum(WorkerStatus);

export const WorkerResourcesSchema = z.object({
  cpuCores: z.number().positive(),
  memoryMB: z.number().positive(),
  diskSpaceGB: z.number().positive(),
  currentCpuUsage: z.number().min(0).max(100),
  currentMemoryUsage: z.number().nonnegative(),
  currentDiskUsage: z.number().nonnegative()
});

export const WorkerCapabilitiesSchema = z.object({
  supportedCategories: z.array(z.nativeEnum(TaskCategory)),
  maxConcurrentTasks: z.number().positive(),
  supportsStreaming: z.boolean(),
  supportsFileOperations: z.boolean(),
  supportsNetworking: z.boolean(),
  claudeCodeVersion: z.string().optional(),
  nodeVersion: z.string(),
  operatingSystem: z.string(),
  architecture: z.string(),
  customCapabilities: z.record(z.boolean()).optional()
});

export const WorkerHealthSchema = z.object({
  isHealthy: z.boolean(),
  lastHealthCheck: z.date(),
  uptime: z.number().nonnegative(),
  responseTime: z.number().nonnegative(),
  errorRate: z.number().min(0).max(100),
  memoryLeaks: z.boolean(),
  diskSpace: z.enum(['low', 'medium', 'high']),
  issues: z.array(z.string()).optional()
});

export const WorkerMetricsSchema = z.object({
  totalTasksCompleted: z.number().nonnegative(),
  totalTasksFailed: z.number().nonnegative(),
  averageTaskDuration: z.number().nonnegative(),
  successRate: z.number().min(0).max(100),
  throughputPerHour: z.number().nonnegative(),
  peakMemoryUsage: z.number().nonnegative(),
  peakCpuUsage: z.number().min(0).max(100),
  startTime: z.date(),
  lastTaskCompletedAt: z.date().optional()
});

export const WorkerConfigSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  endpoint: z.string().url(),
  apiKey: z.string().optional(),
  timeout: z.number().positive(),
  retryAttempts: z.number().nonnegative(),
  healthCheckInterval: z.number().positive(),
  maxIdleTime: z.number().positive(),
  environment: z.record(z.string()).optional(),
  tags: z.array(z.string()).optional()
});

export const WorkerTaskAssignmentSchema = z.object({
  taskId: z.string().min(1),
  assignedAt: z.date(),
  startedAt: z.date().optional(),
  priority: z.nativeEnum(TaskPriority),
  estimatedDuration: z.number().positive().optional()
});

export const WorkerSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  status: WorkerStatusSchema,
  endpoint: z.string().url(),
  capabilities: WorkerCapabilitiesSchema,
  resources: WorkerResourcesSchema,
  health: WorkerHealthSchema,
  metrics: WorkerMetricsSchema,
  config: WorkerConfigSchema,
  currentTasks: z.array(WorkerTaskAssignmentSchema),
  createdAt: z.date(),
  lastSeenAt: z.date(),
  version: z.string(),
  metadata: z.record(z.unknown()).optional()
});