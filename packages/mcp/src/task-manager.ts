import axios from 'axios';
import { randomUUID } from 'crypto';
import { config } from './config';
import { logger } from './logger';
import { WorkerRegistry } from './worker-registry';
import { TaskSubmissionRequest, TaskSubmissionResponse, TaskStatus } from './schemas';

export class TaskManager {
  private tasks: Map<string, TaskStatus> = new Map();
  private workerRegistry: WorkerRegistry;

  constructor(workerRegistry: WorkerRegistry) {
    this.workerRegistry = workerRegistry;
  }

  async submitTask(request: TaskSubmissionRequest): Promise<TaskSubmissionResponse> {
    const taskId = randomUUID();
    
    logger.info('Processing task submission', {
      taskId,
      promptLength: request.prompt.length,
      priority: request.priority
    });

    // Select an available worker
    const selectedWorker = await this.workerRegistry.selectWorkerForTask();
    if (!selectedWorker) {
      throw new Error('No available workers for task execution');
    }

    // Create task record
    const task: TaskStatus = {
      taskId,
      status: 'assigned',
      assignedWorker: selectedWorker.endpoint,
      createdAt: new Date(),
      progress: 0
    };

    this.tasks.set(taskId, task);

    // Forward the task to the selected worker
    try {
      const workerResponse = await axios.post(`${selectedWorker.endpoint}/run`, {
        prompt: request.prompt,
        workerId: selectedWorker.id,
        priority: request.priority,
        metadata: {
          ...request.metadata,
          mcpTaskId: taskId
        }
      }, {
        timeout: config.requestTimeoutMs,
        validateStatus: (status) => status >= 200 && status < 300
      });

      // Update task status based on worker response
      const updatedTask: TaskStatus = {
        ...task,
        status: 'running',
        startedAt: new Date(),
        progress: 0
      };

      this.tasks.set(taskId, updatedTask);

      // Update worker task count
      await this.workerRegistry.updateWorkerTaskCount(selectedWorker.id, true);

      logger.info('Task successfully forwarded to worker', {
        taskId,
        workerId: selectedWorker.id,
        workerEndpoint: selectedWorker.endpoint
      });

      // Start monitoring task progress (placeholder for Task 8 SSE implementation)
      this.startTaskMonitoring(taskId, selectedWorker);

      const response: TaskSubmissionResponse = {
        taskId,
        status: 'running',
        assignedWorker: selectedWorker.endpoint,
        estimatedDuration: workerResponse.data.estimatedDuration,
        streamUrl: `${config.host}:${config.port}/stream/${taskId}`
      };

      return response;

    } catch (error) {
      // Task forwarding failed
      const failedTask: TaskStatus = {
        ...task,
        status: 'failed',
        error: error instanceof Error ? error.message : 'Unknown error occurred',
        completedAt: new Date()
      };

      this.tasks.set(taskId, failedTask);

      logger.error('Failed to forward task to worker', {
        taskId,
        workerId: selectedWorker.id,
        error: error instanceof Error ? error.message : String(error)
      });

      throw error;
    }
  }

  private startTaskMonitoring(taskId: string, worker: any): void {
    // Placeholder implementation for Task 8
    // This will be expanded to handle real-time SSE streaming
    logger.debug(`Started monitoring task ${taskId} on worker ${worker.id}`);
    
    // Simulate task completion after some time (for development)
    if (config.nodeEnv === 'development') {
      setTimeout(async () => {
        await this.completeTask(taskId, worker.id, {
          status: 'completed',
          output: `[SIMULATED] Task ${taskId} completed successfully`,
          duration: 5000
        });
      }, 5000);
    }
  }

  async completeTask(taskId: string, workerId: string, result: {
    status: 'completed' | 'failed';
    output?: string;
    error?: string;
    duration?: number;
  }): Promise<void> {
    const task = this.tasks.get(taskId);
    if (!task) {
      logger.warn(`Attempted to complete unknown task: ${taskId}`);
      return;
    }

    const completedTask: TaskStatus = {
      ...task,
      status: result.status,
      completedAt: new Date(),
      output: result.output,
      error: result.error,
      duration: result.duration,
      progress: 100
    };

    this.tasks.set(taskId, completedTask);

    // Update worker task count
    await this.workerRegistry.updateWorkerTaskCount(workerId, false);

    logger.info('Task completed', {
      taskId,
      workerId,
      status: result.status,
      duration: result.duration
    });
  }

  async getTask(taskId: string): Promise<TaskStatus | undefined> {
    return this.tasks.get(taskId);
  }

  async getAllTasks(): Promise<TaskStatus[]> {
    return Array.from(this.tasks.values());
  }

  async getTasksByStatus(status: TaskStatus['status']): Promise<TaskStatus[]> {
    return Array.from(this.tasks.values()).filter(task => task.status === status);
  }

  async getTasksSummary(): Promise<{
    active: number;
    completed: number;
    failed: number;
    total: number;
  }> {
    const tasks = Array.from(this.tasks.values());
    
    return {
      active: tasks.filter(t => ['pending', 'assigned', 'running'].includes(t.status)).length,
      completed: tasks.filter(t => t.status === 'completed').length,
      failed: tasks.filter(t => t.status === 'failed').length,
      total: tasks.length
    };
  }

  // Clean up old completed tasks to prevent memory leaks
  async cleanupOldTasks(maxAgeMs: number = 24 * 60 * 60 * 1000): Promise<void> { // 24 hours default
    const now = new Date().getTime();
    let cleanedCount = 0;

    for (const [taskId, task] of this.tasks.entries()) {
      if (task.completedAt && (now - task.completedAt.getTime()) > maxAgeMs) {
        this.tasks.delete(taskId);
        cleanedCount++;
      }
    }

    if (cleanedCount > 0) {
      logger.info(`Cleaned up ${cleanedCount} old tasks from memory`);
    }
  }

  // Get task statistics for monitoring
  getTaskStats(): {
    totalTasks: number;
    activeTasks: number;
    completedTasks: number;
    failedTasks: number;
    averageDuration: number | null;
  } {
    const tasks = Array.from(this.tasks.values());
    const completedTasks = tasks.filter(t => t.status === 'completed' && t.duration);
    const averageDuration = completedTasks.length > 0 
      ? completedTasks.reduce((sum, task) => sum + (task.duration || 0), 0) / completedTasks.length
      : null;

    return {
      totalTasks: tasks.length,
      activeTasks: tasks.filter(t => ['pending', 'assigned', 'running'].includes(t.status)).length,
      completedTasks: tasks.filter(t => t.status === 'completed').length,
      failedTasks: tasks.filter(t => t.status === 'failed').length,
      averageDuration
    };
  }
}