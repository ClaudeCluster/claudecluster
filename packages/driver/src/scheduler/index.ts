/**
 * @fileoverview Task Scheduler for intelligent task planning and distribution
 */

import { EventEmitter } from 'eventemitter2';
import type { Task, TaskGraph, TaskPriority, TaskCategory, Worker } from '@claudecluster/core';
import { TaskStatus, WorkerStatus } from '@claudecluster/core';

/**
 * Task scheduling configuration
 */
export interface SchedulerConfig {
  readonly maxConcurrentTasks: number;
  readonly priorityWeights: Record<TaskPriority, number>;
  readonly categoryAffinities: Record<TaskCategory, number>;
  readonly loadBalancingStrategy: 'round-robin' | 'least-loaded' | 'capability-based' | 'affinity-based';
  readonly retryAttempts: number;
  readonly retryDelay: number;
  readonly healthCheckInterval: number;
}

/**
 * Default scheduler configuration
 */
export const DEFAULT_SCHEDULER_CONFIG: SchedulerConfig = {
  maxConcurrentTasks: 50,
  priorityWeights: {
    critical: 100,
    high: 75,
    normal: 50,
    low: 25,
    background: 10
  },
  categoryAffinities: {
    coding: 1.0,
    analysis: 0.8,
    refactoring: 0.9,
    testing: 0.7,
    documentation: 0.6
  },
  loadBalancingStrategy: 'capability-based',
  retryAttempts: 3,
  retryDelay: 1000,
  healthCheckInterval: 30000
};

/**
 * Task execution plan
 */
export interface TaskExecutionPlan {
  readonly taskId: string;
  readonly workerId: string;
  readonly estimatedDuration: number;
  readonly priority: number;
  readonly scheduledAt: Date;
  readonly dependencies: readonly string[];
  readonly retryCount: number;
}

/**
 * Scheduler statistics
 */
export interface SchedulerStats {
  readonly totalTasks: number;
  readonly completedTasks: number;
  readonly failedTasks: number;
  readonly pendingTasks: number;
  readonly runningTasks: number;
  readonly averageWaitTime: number;
  readonly averageExecutionTime: number;
  readonly throughput: number; // tasks per minute
  readonly workerUtilization: number; // percentage
}

/**
 * Scheduler events
 */
export interface SchedulerEvents {
  'task-scheduled': (plan: TaskExecutionPlan) => void;
  'task-started': (taskId: string, workerId: string) => void;
  'task-completed': (taskId: string, workerId: string, duration: number) => void;
  'task-failed': (taskId: string, workerId: string, error: Error) => void;
  'task-retry': (taskId: string, attempt: number) => void;
  'worker-assigned': (workerId: string, taskId: string) => void;
  'worker-released': (workerId: string, taskId: string) => void;
  'queue-empty': () => void;
  'queue-full': () => void;
  'stats-updated': (stats: SchedulerStats) => void;
}

/**
 * Task queue entry
 */
interface QueuedTask {
  readonly task: Task;
  readonly queuedAt: Date;
  readonly retryCount: number;
  readonly lastAttempt?: Date;
  readonly assignedWorker?: string;
}

/**
 * Worker assignment tracking
 */
interface WorkerAssignment {
  readonly workerId: string;
  readonly taskIds: Set<string>;
  readonly assignedAt: Date;
  readonly capacity: number;
  readonly currentLoad: number;
}

/**
 * Task Scheduler implementation
 */
export class TaskScheduler extends EventEmitter<SchedulerEvents> {
  private readonly config: SchedulerConfig;
  private readonly taskQueue = new Map<string, QueuedTask>();
  private readonly executionPlans = new Map<string, TaskExecutionPlan>();
  private readonly workerAssignments = new Map<string, WorkerAssignment>();
  private readonly taskMetrics = new Map<string, { startTime: Date; endTime?: Date; duration?: number }>();
  
  private workers = new Map<string, Worker>();
  private isRunning = false;
  private schedulerInterval?: NodeJS.Timeout;
  private healthCheckInterval?: NodeJS.Timeout;
  private stats: SchedulerStats;

  constructor(config: Partial<SchedulerConfig> = {}) {
    super();
    
    this.config = { ...DEFAULT_SCHEDULER_CONFIG, ...config };
    this.stats = this.initializeStats();
    
    this.setupEventHandlers();
  }

  /**
   * Initialize scheduler statistics
   */
  private initializeStats(): SchedulerStats {
    return {
      totalTasks: 0,
      completedTasks: 0,
      failedTasks: 0,
      pendingTasks: 0,
      runningTasks: 0,
      averageWaitTime: 0,
      averageExecutionTime: 0,
      throughput: 0,
      workerUtilization: 0
    };
  }

  /**
   * Set up event handlers
   */
  private setupEventHandlers(): void {
    this.on('task-completed', this.handleTaskCompleted.bind(this));
    this.on('task-failed', this.handleTaskFailed.bind(this));
    this.on('worker-assigned', this.handleWorkerAssigned.bind(this));
    this.on('worker-released', this.handleWorkerReleased.bind(this));
  }

  /**
   * Start the scheduler
   */
  async start(): Promise<void> {
    if (this.isRunning) return;
    
    this.isRunning = true;
    
    // Start scheduling loop
    this.schedulerInterval = setInterval(() => {
      this.processQueue().catch(error => {
        this.emit('error', error);
      });
    }, 1000);
    
    // Start health check
    this.healthCheckInterval = setInterval(() => {
      this.performHealthCheck().catch(error => {
        this.emit('error', error);
      });
    }, this.config.healthCheckInterval);
    
    this.emit('started');
  }

  /**
   * Stop the scheduler
   */
  async stop(): Promise<void> {
    if (!this.isRunning) return;
    
    this.isRunning = false;
    
    if (this.schedulerInterval) {
      clearInterval(this.schedulerInterval);
      this.schedulerInterval = undefined;
    }
    
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = undefined;
    }
    
    this.emit('stopped');
  }

  /**
   * Register a worker
   */
  registerWorker(worker: Worker): void {
    this.workers.set(worker.id, worker);
    
    this.workerAssignments.set(worker.id, {
      workerId: worker.id,
      taskIds: new Set(),
      assignedAt: new Date(),
      capacity: worker.capabilities.maxConcurrentTasks,
      currentLoad: 0
    });
    
    this.emit('worker-registered', worker);
  }

  /**
   * Unregister a worker
   */
  unregisterWorker(workerId: string): void {
    const assignment = this.workerAssignments.get(workerId);
    if (assignment) {
      // Reschedule any assigned tasks
      for (const taskId of assignment.taskIds) {
        this.requeueTask(taskId);
      }
    }
    
    this.workers.delete(workerId);
    this.workerAssignments.delete(workerId);
    
    this.emit('worker-unregistered', workerId);
  }

  /**
   * Submit a task for scheduling
   */
  async submitTask(task: Task): Promise<void> {
    if (this.taskQueue.has(task.id)) {
      throw new Error(`Task ${task.id} is already queued`);
    }

    const queuedTask: QueuedTask = {
      task,
      queuedAt: new Date(),
      retryCount: 0
    };

    this.taskQueue.set(task.id, queuedTask);
    this.stats.totalTasks++;
    this.stats.pendingTasks++;
    
    this.emit('task-queued', task);
    this.updateStats();
    
    // Try immediate scheduling if resources available
    if (this.isRunning) {
      await this.processQueue();
    }
  }

  /**
   * Cancel a task
   */
  async cancelTask(taskId: string): Promise<void> {
    const queuedTask = this.taskQueue.get(taskId);
    if (!queuedTask) {
      throw new Error(`Task ${taskId} not found in queue`);
    }

    // Remove from queue
    this.taskQueue.delete(taskId);
    this.executionPlans.delete(taskId);
    
    // Release worker if assigned
    if (queuedTask.assignedWorker) {
      this.releaseWorker(queuedTask.assignedWorker, taskId);
    }
    
    this.stats.pendingTasks = Math.max(0, this.stats.pendingTasks - 1);
    this.emit('task-cancelled', taskId);
    this.updateStats();
  }

  /**
   * Process the task queue
   */
  private async processQueue(): Promise<void> {
    if (!this.isRunning || this.taskQueue.size === 0) {
      return;
    }

    const availableWorkers = this.getAvailableWorkers();
    if (availableWorkers.length === 0) {
      return;
    }

    // Sort tasks by priority and dependencies
    const schedulableTasks = this.getSchedulableTasks();
    if (schedulableTasks.length === 0) {
      return;
    }

    // Schedule tasks to workers
    for (const queuedTask of schedulableTasks) {
      if (availableWorkers.length === 0) break;
      
      const worker = this.selectWorker(queuedTask.task, availableWorkers);
      if (!worker) continue;
      
      await this.scheduleTask(queuedTask, worker);
      
      // Remove from available workers if at capacity
      const assignment = this.workerAssignments.get(worker.id);
      if (assignment && assignment.currentLoad >= assignment.capacity) {
        const index = availableWorkers.indexOf(worker);
        if (index > -1) {
          availableWorkers.splice(index, 1);
        }
      }
    }
  }

  /**
   * Get workers available for task assignment
   */
  private getAvailableWorkers(): Worker[] {
    const available: Worker[] = [];
    
    for (const [workerId, worker] of this.workers) {
      if (worker.status !== WorkerStatus.IDLE && worker.status !== WorkerStatus.BUSY) {
        continue;
      }
      
      const assignment = this.workerAssignments.get(workerId);
      if (!assignment || assignment.currentLoad < assignment.capacity) {
        available.push(worker);
      }
    }
    
    return available;
  }

  /**
   * Get tasks that can be scheduled (dependencies satisfied)
   */
  private getSchedulableTasks(): QueuedTask[] {
    const schedulable: QueuedTask[] = [];
    const now = new Date();
    
    for (const [taskId, queuedTask] of this.taskQueue) {
      // Skip if already assigned
      if (queuedTask.assignedWorker) continue;
      
      // Check retry delay
      if (queuedTask.lastAttempt) {
        const timeSinceAttempt = now.getTime() - queuedTask.lastAttempt.getTime();
        if (timeSinceAttempt < this.config.retryDelay) continue;
      }
      
      // Check dependencies
      if (this.areDependenciesSatisfied(queuedTask.task)) {
        schedulable.push(queuedTask);
      }
    }
    
    // Sort by priority and queue time
    return schedulable.sort((a, b) => {
      const priorityDiff = this.getPriorityWeight(b.task.priority) - this.getPriorityWeight(a.task.priority);
      if (priorityDiff !== 0) return priorityDiff;
      
      return a.queuedAt.getTime() - b.queuedAt.getTime();
    });
  }

  /**
   * Check if task dependencies are satisfied
   */
  private areDependenciesSatisfied(task: Task): boolean {
    for (const dependencyId of task.dependencies) {
      // Check if dependency is completed
      const dependencyTask = this.taskQueue.get(dependencyId);
      if (dependencyTask && dependencyTask.task.status !== TaskStatus.COMPLETED) {
        return false;
      }
    }
    return true;
  }

  /**
   * Select the best worker for a task
   */
  private selectWorker(task: Task, availableWorkers: Worker[]): Worker | null {
    if (availableWorkers.length === 0) return null;
    
    switch (this.config.loadBalancingStrategy) {
      case 'round-robin':
        return this.selectWorkerRoundRobin(availableWorkers);
      case 'least-loaded':
        return this.selectWorkerLeastLoaded(availableWorkers);
      case 'capability-based':
        return this.selectWorkerCapabilityBased(task, availableWorkers);
      case 'affinity-based':
        return this.selectWorkerAffinityBased(task, availableWorkers);
      default:
        return availableWorkers[0];
    }
  }

  /**
   * Round-robin worker selection
   */
  private selectWorkerRoundRobin(workers: Worker[]): Worker {
    // Simple round-robin based on total assignments
    let minAssignments = Infinity;
    let selectedWorker = workers[0];
    
    for (const worker of workers) {
      const assignment = this.workerAssignments.get(worker.id);
      const totalAssignments = assignment ? assignment.taskIds.size : 0;
      
      if (totalAssignments < minAssignments) {
        minAssignments = totalAssignments;
        selectedWorker = worker;
      }
    }
    
    return selectedWorker;
  }

  /**
   * Least-loaded worker selection
   */
  private selectWorkerLeastLoaded(workers: Worker[]): Worker {
    let lowestLoad = Infinity;
    let selectedWorker = workers[0];
    
    for (const worker of workers) {
      const assignment = this.workerAssignments.get(worker.id);
      const load = assignment ? assignment.currentLoad / assignment.capacity : 0;
      
      if (load < lowestLoad) {
        lowestLoad = load;
        selectedWorker = worker;
      }
    }
    
    return selectedWorker;
  }

  /**
   * Capability-based worker selection
   */
  private selectWorkerCapabilityBased(task: Task, workers: Worker[]): Worker | null {
    const suitableWorkers = workers.filter(worker => 
      worker.capabilities.supportedCategories.includes(task.category)
    );
    
    if (suitableWorkers.length === 0) {
      return workers.length > 0 ? workers[0] : null;
    }
    
    return this.selectWorkerLeastLoaded(suitableWorkers);
  }

  /**
   * Affinity-based worker selection
   */
  private selectWorkerAffinityBased(task: Task, workers: Worker[]): Worker | null {
    let bestScore = -1;
    let selectedWorker: Worker | null = null;
    
    for (const worker of workers) {
      let score = 0;
      
      // Category affinity
      if (worker.capabilities.supportedCategories.includes(task.category)) {
        score += this.config.categoryAffinities[task.category] || 0;
      }
      
      // Load factor (prefer less loaded workers)
      const assignment = this.workerAssignments.get(worker.id);
      const load = assignment ? assignment.currentLoad / assignment.capacity : 0;
      score += (1 - load) * 0.5;
      
      if (score > bestScore) {
        bestScore = score;
        selectedWorker = worker;
      }
    }
    
    return selectedWorker;
  }

  /**
   * Schedule a task to a worker
   */
  private async scheduleTask(queuedTask: QueuedTask, worker: Worker): Promise<void> {
    const { task } = queuedTask;
    
    // Create execution plan
    const plan: TaskExecutionPlan = {
      taskId: task.id,
      workerId: worker.id,
      estimatedDuration: this.estimateTaskDuration(task),
      priority: this.getPriorityWeight(task.priority),
      scheduledAt: new Date(),
      dependencies: task.dependencies,
      retryCount: queuedTask.retryCount
    };
    
    this.executionPlans.set(task.id, plan);
    
    // Update queued task
    const updatedTask: QueuedTask = {
      ...queuedTask,
      assignedWorker: worker.id,
      lastAttempt: new Date()
    };
    this.taskQueue.set(task.id, updatedTask);
    
    // Assign to worker
    this.assignWorker(worker.id, task.id);
    
    // Update metrics
    this.taskMetrics.set(task.id, { startTime: new Date() });
    this.stats.pendingTasks--;
    this.stats.runningTasks++;
    
    this.emit('task-scheduled', plan);
    this.emit('task-started', task.id, worker.id);
    this.updateStats();
  }

  /**
   * Assign a worker to a task
   */
  private assignWorker(workerId: string, taskId: string): void {
    const assignment = this.workerAssignments.get(workerId);
    if (assignment) {
      assignment.taskIds.add(taskId);
      assignment.currentLoad++;
    }
    
    this.emit('worker-assigned', workerId, taskId);
  }

  /**
   * Release a worker from a task
   */
  private releaseWorker(workerId: string, taskId: string): void {
    const assignment = this.workerAssignments.get(workerId);
    if (assignment) {
      assignment.taskIds.delete(taskId);
      assignment.currentLoad = Math.max(0, assignment.currentLoad - 1);
    }
    
    this.emit('worker-released', workerId, taskId);
  }

  /**
   * Handle task completion
   */
  private handleTaskCompleted(taskId: string, workerId: string, duration: number): void {
    this.taskQueue.delete(taskId);
    this.executionPlans.delete(taskId);
    this.releaseWorker(workerId, taskId);
    
    // Update metrics
    const metric = this.taskMetrics.get(taskId);
    if (metric) {
      metric.endTime = new Date();
      metric.duration = duration;
    }
    
    this.stats.runningTasks--;
    this.stats.completedTasks++;
    this.updateStats();
  }

  /**
   * Handle task failure
   */
  private handleTaskFailed(taskId: string, workerId: string, error: Error): void {
    const queuedTask = this.taskQueue.get(taskId);
    if (!queuedTask) return;
    
    this.releaseWorker(workerId, taskId);
    this.stats.runningTasks--;
    
    // Check if we should retry
    if (queuedTask.retryCount < this.config.retryAttempts) {
      const retryTask: QueuedTask = {
        ...queuedTask,
        retryCount: queuedTask.retryCount + 1,
        assignedWorker: undefined,
        lastAttempt: new Date()
      };
      
      this.taskQueue.set(taskId, retryTask);
      this.stats.pendingTasks++;
      
      this.emit('task-retry', taskId, retryTask.retryCount);
    } else {
      // Max retries exceeded
      this.taskQueue.delete(taskId);
      this.executionPlans.delete(taskId);
      this.stats.failedTasks++;
    }
    
    this.updateStats();
  }

  /**
   * Handle worker assignment
   */
  private handleWorkerAssigned(workerId: string, taskId: string): void {
    // Update worker utilization
    this.updateStats();
  }

  /**
   * Handle worker release
   */
  private handleWorkerReleased(workerId: string, taskId: string): void {
    // Update worker utilization
    this.updateStats();
  }

  /**
   * Requeue a task (after worker failure)
   */
  private requeueTask(taskId: string): void {
    const queuedTask = this.taskQueue.get(taskId);
    if (queuedTask && queuedTask.assignedWorker) {
      const requeuedTask: QueuedTask = {
        ...queuedTask,
        assignedWorker: undefined,
        lastAttempt: new Date()
      };
      
      this.taskQueue.set(taskId, requeuedTask);
      this.stats.runningTasks--;
      this.stats.pendingTasks++;
      
      this.emit('task-requeued', taskId);
      this.updateStats();
    }
  }

  /**
   * Perform health check on workers
   */
  private async performHealthCheck(): Promise<void> {
    const unhealthyWorkers: string[] = [];
    
    for (const [workerId, worker] of this.workers) {
      if (worker.status === WorkerStatus.ERROR || worker.status === WorkerStatus.OFFLINE) {
        unhealthyWorkers.push(workerId);
      }
    }
    
    // Handle unhealthy workers
    for (const workerId of unhealthyWorkers) {
      this.handleUnhealthyWorker(workerId);
    }
  }

  /**
   * Handle unhealthy worker
   */
  private handleUnhealthyWorker(workerId: string): void {
    const assignment = this.workerAssignments.get(workerId);
    if (assignment) {
      // Reschedule assigned tasks
      for (const taskId of assignment.taskIds) {
        this.requeueTask(taskId);
      }
    }
    
    this.emit('worker-unhealthy', workerId);
  }

  /**
   * Update statistics
   */
  private updateStats(): void {
    // Calculate worker utilization
    let totalCapacity = 0;
    let totalLoad = 0;
    
    for (const assignment of this.workerAssignments.values()) {
      totalCapacity += assignment.capacity;
      totalLoad += assignment.currentLoad;
    }
    
    this.stats.workerUtilization = totalCapacity > 0 ? (totalLoad / totalCapacity) * 100 : 0;
    
    // Calculate throughput and timing metrics
    const completedMetrics = Array.from(this.taskMetrics.values())
      .filter(m => m.endTime && m.duration);
    
    if (completedMetrics.length > 0) {
      const totalDuration = completedMetrics.reduce((sum, m) => sum + (m.duration || 0), 0);
      this.stats.averageExecutionTime = totalDuration / completedMetrics.length;
      
      // Calculate throughput (tasks per minute over last hour)
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
      const recentCompletions = completedMetrics.filter(m => 
        m.endTime && m.endTime > oneHourAgo
      );
      this.stats.throughput = recentCompletions.length;
    }
    
    this.emit('stats-updated', this.stats);
  }

  /**
   * Estimate task duration based on category and history
   */
  private estimateTaskDuration(task: Task): number {
    const categoryBaseline = {
      coding: 300000, // 5 minutes
      analysis: 120000, // 2 minutes
      refactoring: 240000, // 4 minutes
      testing: 180000, // 3 minutes
      documentation: 150000 // 2.5 minutes
    };
    
    return categoryBaseline[task.category] || 300000;
  }

  /**
   * Get priority weight
   */
  private getPriorityWeight(priority: TaskPriority): number {
    return this.config.priorityWeights[priority] || 50;
  }

  /**
   * Get current scheduler statistics
   */
  getStats(): SchedulerStats {
    return { ...this.stats };
  }

  /**
   * Get queued tasks
   */
  getQueuedTasks(): QueuedTask[] {
    return Array.from(this.taskQueue.values());
  }

  /**
   * Get execution plans
   */
  getExecutionPlans(): TaskExecutionPlan[] {
    return Array.from(this.executionPlans.values());
  }

  /**
   * Get worker assignments
   */
  getWorkerAssignments(): Map<string, WorkerAssignment> {
    return new Map(this.workerAssignments);
  }

  /**
   * Get registered workers
   */
  getRegisteredWorkers(): Worker[] {
    return Array.from(this.workers.values());
  }
}