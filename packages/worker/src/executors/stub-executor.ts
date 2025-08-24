import { BaseTaskExecutor } from './base-executor';
import { TaskResult } from '../interfaces';
import { TaskSubmissionRequest } from '../schemas';
import { logger } from '../logger';

/**
 * Stub executor for Phase 0
 * Simulates task execution without actual CLI spawning
 * Will be replaced by PTYTaskExecutor in Phase 1
 */
export class StubTaskExecutor extends BaseTaskExecutor {
  async execute(taskId: string, request: TaskSubmissionRequest): Promise<TaskResult> {
    const startTime = Date.now();
    
    // Create and track task status
    this.createTaskStatus(taskId);
    
    logger.info(`Starting stub execution for task ${taskId}`, {
      promptLength: request.prompt.length,
      priority: request.priority
    });

    // Simulate task progression
    this.updateTaskStatus(taskId, 'running');
    
    // Estimate duration based on prompt complexity
    const duration = this.estimateDuration(request.prompt);
    
    // Simulate work progress
    return new Promise((resolve) => {
      const progressInterval = setInterval(() => {
        const task = this.getStatus(taskId);
        if (!task || task.status !== 'running') {
          clearInterval(progressInterval);
          return;
        }
        
        const elapsed = Date.now() - startTime;
        const progress = Math.min(Math.floor((elapsed / duration) * 100), 90);
        this.updateTaskStatus(taskId, 'running', progress);
      }, 100);

      setTimeout(() => {
        clearInterval(progressInterval);
        
        // Complete the task
        this.updateTaskStatus(taskId, 'completed', 100);
        
        const result: TaskResult = {
          taskId,
          status: 'completed',
          output: `Stub execution completed for prompt: "${request.prompt.substring(0, 50)}..."`,
          duration: Date.now() - startTime
        };
        
        logger.info(`Completed stub execution for task ${taskId}`, {
          duration: result.duration
        });
        
        resolve(result);
      }, duration);
    });
  }

  private estimateDuration(prompt: string): number {
    // Simple duration estimation based on prompt length
    const baseTime = 2000; // 2 seconds minimum
    const wordsEstimate = prompt.split(' ').length * 50; // 50ms per word
    return Math.min(baseTime + wordsEstimate, 30000); // Max 30 seconds for stub
  }
}