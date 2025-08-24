import { ITaskExecutor, TaskResult, TaskExecutionStatus } from '../interfaces';
import { TaskSubmissionRequest } from '../schemas';
import { logger } from '../logger';

/**
 * Base implementation of ITaskExecutor
 * Provides common functionality for all executors
 */
export abstract class BaseTaskExecutor implements ITaskExecutor {
  protected tasks: Map<string, TaskExecutionStatus> = new Map();

  abstract execute(taskId: string, request: TaskSubmissionRequest): Promise<TaskResult>;

  getStatus(taskId: string): TaskExecutionStatus | undefined {
    return this.tasks.get(taskId);
  }

  async cancel(taskId: string): Promise<boolean> {
    const task = this.tasks.get(taskId);
    if (!task || task.status !== 'running') {
      return false;
    }

    task.status = 'cancelled';
    task.endTime = new Date();
    
    logger.info(`Task ${taskId} cancelled`);
    return true;
  }

  async cleanup(): Promise<void> {
    // Remove completed/cancelled tasks older than 1 hour
    const cutoff = new Date(Date.now() - 60 * 60 * 1000);
    
    for (const [taskId, task] of this.tasks) {
      if (
        task.endTime && 
        task.endTime < cutoff && 
        ['completed', 'failed', 'cancelled'].includes(task.status)
      ) {
        this.tasks.delete(taskId);
        logger.debug(`Cleaned up task ${taskId}`);
      }
    }
  }

  protected updateTaskStatus(
    taskId: string, 
    status: TaskExecutionStatus['status'],
    progress?: number
  ): void {
    const task = this.tasks.get(taskId);
    if (task) {
      task.status = status;
      task.progress = progress;
      
      if (status === 'running' && !task.startTime) {
        task.startTime = new Date();
      }
      
      if (['completed', 'failed', 'cancelled'].includes(status)) {
        task.endTime = new Date();
      }
    }
  }

  protected createTaskStatus(taskId: string): TaskExecutionStatus {
    const status: TaskExecutionStatus = {
      taskId,
      status: 'pending',
      progress: 0
    };
    
    this.tasks.set(taskId, status);
    return status;
  }
}