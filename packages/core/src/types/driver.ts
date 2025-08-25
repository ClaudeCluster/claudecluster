/**
 * @fileoverview Driver orchestration types for ClaudeCluster
 */

import { z } from 'zod';
import type { Task } from './task.js';
import { TaskPriority, TaskStatus } from './task.js';
import type { Worker, WorkerSelectionCriteria } from './worker.js';

/**
 * Driver status enumeration
 */
export enum DriverStatus {
  INITIALIZING = 'initializing',
  RUNNING = 'running',
  PAUSED = 'paused',
  STOPPED = 'stopped',
  ERROR = 'error',
  SHUTTING_DOWN = 'shutting_down'
}

/**
 * Task execution strategy
 */
export enum ExecutionStrategy {
  SEQUENTIAL = 'sequential',
  PARALLEL = 'parallel',
  ADAPTIVE = 'adaptive',
  PRIORITY_FIRST = 'priority_first',
  SHORTEST_FIRST = 'shortest_first',
  DEPENDENCY_AWARE = 'dependency_aware'
}

/**
 * Task dependency relationship
 */
export interface TaskDependency {
  readonly taskId: string;
  readonly dependsOn: string;
  readonly type: 'hard' | 'soft'; // hard = blocking, soft = preferred order
  readonly condition?: string; // optional condition for dependency
}

/**
 * Task graph node representing a task and its relationships
 */
export interface TaskGraphNode {
  readonly task: Task;
  readonly dependencies: readonly string[]; // incoming dependencies
  readonly dependents: readonly string[]; // outgoing dependencies  
  readonly depth: number; // level in dependency tree
  readonly canExecute: boolean; // all dependencies satisfied
}

/**
 * Task dependency graph for execution planning
 */
export class TaskGraph {
  private readonly nodes: Map<string, TaskGraphNode>;
  private readonly dependencies: Map<string, Set<string>>;
  
  constructor(tasks: readonly Task[]) {
    this.nodes = new Map();
    this.dependencies = new Map();
    this.buildGraph(tasks);
  }
  
  /**
   * Build the task dependency graph
   */
  private buildGraph(tasks: readonly Task[]): void {
    // Initialize nodes
    for (const task of tasks) {
      this.nodes.set(task.id, {
        task,
        dependencies: task.dependencies,
        dependents: [],
        depth: 0,
        canExecute: task.dependencies.length === 0
      });
      this.dependencies.set(task.id, new Set(task.dependencies));
    }
    
    // Calculate dependents and depths
    this.calculateDependents();
    this.calculateDepths();
    this.updateExecutableStatus();
  }
  
  private calculateDependents(): void {
    const dependents = new Map<string, Set<string>>();
    
    for (const [taskId, deps] of this.dependencies) {
      for (const depId of deps) {
        if (!dependents.has(depId)) {
          dependents.set(depId, new Set());
        }
        dependents.get(depId)!.add(taskId);
      }
    }
    
    // Update nodes with dependent information
    for (const [taskId, node] of this.nodes) {
      const taskDependents = Array.from(dependents.get(taskId) || []);
      this.nodes.set(taskId, { ...node, dependents: taskDependents });
    }
  }
  
  private calculateDepths(): void {
    const visited = new Set<string>();
    
    const calculateDepth = (taskId: string): number => {
      if (visited.has(taskId)) return 0;
      visited.add(taskId);
      
      const deps = this.dependencies.get(taskId) || new Set();
      if (deps.size === 0) return 0;
      
      const maxDepth = Math.max(...Array.from(deps).map(calculateDepth));
      const node = this.nodes.get(taskId)!;
      this.nodes.set(taskId, { ...node, depth: maxDepth + 1 });
      
      return maxDepth + 1;
    };
    
    for (const taskId of this.nodes.keys()) {
      if (!visited.has(taskId)) {
        calculateDepth(taskId);
      }
    }
  }
  
  private updateExecutableStatus(): void {
    for (const [taskId, node] of this.nodes) {
      const canExecute = node.task.status === TaskStatus.PENDING &&
        Array.from(this.dependencies.get(taskId) || [])
          .every(depId => {
            const depNode = this.nodes.get(depId);
            return depNode?.task.status === TaskStatus.COMPLETED;
          });
      
      this.nodes.set(taskId, { ...node, canExecute });
    }
  }
  
  /**
   * Get all executable tasks (dependencies satisfied)
   */
  getExecutableTasks(): readonly TaskGraphNode[] {
    return Array.from(this.nodes.values()).filter(node => node.canExecute);
  }
  
  /**
   * Get topologically sorted task order
   */
  getTopologicalOrder(): readonly string[] {
    const result: string[] = [];
    const visited = new Set<string>();
    const visiting = new Set<string>();
    
    const visit = (taskId: string): void => {
      if (visited.has(taskId)) return;
      if (visiting.has(taskId)) {
        throw new Error(`Circular dependency detected involving task ${taskId}`);
      }
      
      visiting.add(taskId);
      const deps = this.dependencies.get(taskId) || new Set();
      for (const depId of deps) {
        visit(depId);
      }
      
      visiting.delete(taskId);
      visited.add(taskId);
      result.push(taskId);
    };
    
    for (const taskId of this.nodes.keys()) {
      if (!visited.has(taskId)) {
        visit(taskId);
      }
    }
    
    return result;
  }
  
  /**
   * Mark task as completed and update executable status
   */
  markTaskCompleted(taskId: string): void {
    const node = this.nodes.get(taskId);
    if (!node) return;
    
    // Update task status
    const updatedTask = { ...node.task, status: TaskStatus.COMPLETED };
    this.nodes.set(taskId, { ...node, task: updatedTask });
    
    // Recalculate executable status for all tasks
    this.updateExecutableStatus();
  }
  
  /**
   * Get node by task ID
   */
  getNode(taskId: string): TaskGraphNode | undefined {
    return this.nodes.get(taskId);
  }
  
  /**
   * Get all nodes
   */
  getAllNodes(): readonly TaskGraphNode[] {
    return Array.from(this.nodes.values());
  }
}

/**
 * Execution plan for a set of tasks
 */
export interface ExecutionPlan {
  readonly id: string;
  readonly tasks: readonly Task[];
  readonly strategy: ExecutionStrategy;
  readonly estimatedDuration: number; // milliseconds
  readonly parallelismLevel: number; // max concurrent tasks
  readonly phases: readonly ExecutionPhase[];
  readonly createdAt: Date;
}

/**
 * Execution phase containing tasks that can run in parallel
 */
export interface ExecutionPhase {
  readonly phase: number;
  readonly tasks: readonly string[]; // task IDs
  readonly estimatedDuration: number; // milliseconds
  readonly requiredWorkers: number;
}

/**
 * Driver configuration settings
 */
export interface DriverConfig {
  readonly maxConcurrentTasks: number;
  readonly maxWorkers: number;
  readonly taskTimeout: number; // milliseconds
  readonly healthCheckInterval: number; // milliseconds
  readonly retryAttempts: number;
  readonly executionStrategy: ExecutionStrategy;
  readonly loadBalancing: boolean;
  readonly failureHandling: 'abort' | 'continue' | 'retry';
  readonly resourceOptimization: boolean;
}

/**
 * Driver performance metrics
 */
export interface DriverMetrics {
  readonly totalTasksProcessed: number;
  readonly totalTasksSucceeded: number;
  readonly totalTasksFailed: number;
  readonly averageTaskDuration: number; // milliseconds
  readonly currentThroughput: number; // tasks per minute
  readonly peakThroughput: number; // tasks per minute
  readonly averageWorkerUtilization: number; // percentage
  readonly totalExecutionTime: number; // milliseconds
  readonly startTime: Date;
  readonly lastTaskCompletedAt?: Date;
}

/**
 * Current driver execution state
 */
export interface DriverExecutionState {
  readonly currentPlan?: ExecutionPlan;
  readonly runningTasks: readonly string[]; // task IDs
  readonly completedTasks: readonly string[]; // task IDs
  readonly failedTasks: readonly string[]; // task IDs
  readonly queuedTasks: readonly string[]; // task IDs
  readonly currentPhase: number;
  readonly progress: {
    readonly completedTasks: number;
    readonly totalTasks: number;
    readonly percentage: number;
    readonly estimatedTimeRemaining?: number; // milliseconds
  };
}

/**
 * Core driver interface
 */
export interface Driver {
  readonly id: string;
  readonly name: string;
  readonly status: DriverStatus;
  readonly config: DriverConfig;
  readonly workers: readonly Worker[];
  readonly executionState: DriverExecutionState;
  readonly metrics: DriverMetrics;
  readonly taskGraph?: TaskGraph;
  readonly createdAt: Date;
  readonly lastUpdatedAt: Date;
  readonly version: string;
  readonly metadata?: Record<string, unknown>;
}

/**
 * Driver task assignment result
 */
export interface TaskAssignmentResult {
  readonly taskId: string;
  readonly workerId: string;
  readonly assignedAt: Date;
  readonly estimatedStartTime: Date;
  readonly estimatedDuration: number; // milliseconds
}

/**
 * Driver task scheduling request
 */
export interface ScheduleTasksRequest {
  readonly tasks: readonly Task[];
  readonly strategy?: ExecutionStrategy;
  readonly maxConcurrency?: number;
  readonly workerCriteria?: WorkerSelectionCriteria;
  readonly priority?: TaskPriority;
}

/**
 * Driver task scheduling result
 */
export interface ScheduleTasksResult {
  readonly planId: string;
  readonly assignments: readonly TaskAssignmentResult[];
  readonly estimatedCompletionTime: Date;
  readonly phases: readonly ExecutionPhase[];
  readonly warnings?: readonly string[];
}

/**
 * Zod schemas for runtime validation
 */
export const DriverStatusSchema = z.nativeEnum(DriverStatus);
export const ExecutionStrategySchema = z.nativeEnum(ExecutionStrategy);

export const TaskDependencySchema = z.object({
  taskId: z.string().min(1),
  dependsOn: z.string().min(1),
  type: z.enum(['hard', 'soft']),
  condition: z.string().optional()
});

export const ExecutionPhaseSchema = z.object({
  phase: z.number().nonnegative(),
  tasks: z.array(z.string().min(1)),
  estimatedDuration: z.number().positive(),
  requiredWorkers: z.number().positive()
});

export const ExecutionPlanSchema = z.object({
  id: z.string().min(1),
  tasks: z.array(z.object({})), // Task schema would be imported
  strategy: ExecutionStrategySchema,
  estimatedDuration: z.number().positive(),
  parallelismLevel: z.number().positive(),
  phases: z.array(ExecutionPhaseSchema),
  createdAt: z.date()
});

export const DriverConfigSchema = z.object({
  maxConcurrentTasks: z.number().positive(),
  maxWorkers: z.number().positive(),
  taskTimeout: z.number().positive(),
  healthCheckInterval: z.number().positive(),
  retryAttempts: z.number().nonnegative(),
  executionStrategy: ExecutionStrategySchema,
  loadBalancing: z.boolean(),
  failureHandling: z.enum(['abort', 'continue', 'retry']),
  resourceOptimization: z.boolean()
});

export const DriverMetricsSchema = z.object({
  totalTasksProcessed: z.number().nonnegative(),
  totalTasksSucceeded: z.number().nonnegative(),
  totalTasksFailed: z.number().nonnegative(),
  averageTaskDuration: z.number().nonnegative(),
  currentThroughput: z.number().nonnegative(),
  peakThroughput: z.number().nonnegative(),
  averageWorkerUtilization: z.number().min(0).max(100),
  totalExecutionTime: z.number().nonnegative(),
  startTime: z.date(),
  lastTaskCompletedAt: z.date().optional()
});

export const DriverExecutionStateSchema = z.object({
  currentPlan: ExecutionPlanSchema.optional(),
  runningTasks: z.array(z.string()),
  completedTasks: z.array(z.string()),
  failedTasks: z.array(z.string()),
  queuedTasks: z.array(z.string()),
  currentPhase: z.number().nonnegative(),
  progress: z.object({
    completedTasks: z.number().nonnegative(),
    totalTasks: z.number().nonnegative(),
    percentage: z.number().min(0).max(100),
    estimatedTimeRemaining: z.number().positive().optional()
  })
});