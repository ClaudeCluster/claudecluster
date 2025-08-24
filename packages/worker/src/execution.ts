import { randomUUID } from 'crypto';
import { TaskSubmissionRequest, TaskSubmissionResponse } from './schemas';
import { logger } from './logger';
import { ITaskExecutor, IStreamingService, StreamEventType } from './interfaces';
import { ExecutionFactory } from './execution-factory';

export class TaskExecutionService {
  private activeTasks: Map<string, any> = new Map();
  private healthService?: any; // Will be injected
  private taskExecutor: ITaskExecutor;
  private streamingService: IStreamingService;
  private factory: ExecutionFactory;

  constructor() {
    this.factory = ExecutionFactory.getInstance();
    
    // Create executors using factory (auto-detects best implementation)
    this.taskExecutor = this.factory.createTaskExecutor();
    this.streamingService = this.factory.createStreamingService();
    
    logger.info('TaskExecutionService initialized', this.factory.getFactoryInfo());
  }

  setHealthService(healthService: any): void {
    this.healthService = healthService;
  }

  // Method to swap executor implementations (for testing/production)
  setTaskExecutor(executor: ITaskExecutor): void {
    this.taskExecutor = executor;
    logger.info('Task executor implementation updated');
  }

  // Method to swap streaming implementations (for testing/production)  
  setStreamingService(service: IStreamingService): void {
    this.streamingService = service;
    logger.info('Streaming service implementation updated');
  }

  // Method to recreate components with specific types
  reinitializeWithTypes(executorType?: 'stub' | 'pty', streamingType?: 'stub' | 'sse'): void {
    this.taskExecutor = this.factory.createTaskExecutor(executorType);
    this.streamingService = this.factory.createStreamingService(streamingType);
    
    logger.info('Reinitialized execution components', { 
      executorType, 
      streamingType,
      factoryInfo: this.factory.getFactoryInfo()
    });
  }

  async submitTask(request: TaskSubmissionRequest): Promise<TaskSubmissionResponse> {
    const taskId = randomUUID();
    
    logger.info('Received task submission:', {
      taskId,
      prompt: request.prompt.substring(0, 100) + (request.prompt.length > 100 ? '...' : ''),
      priority: request.priority,
      workerId: request.workerId
    });

    const task = {
      id: taskId,
      prompt: request.prompt,
      workerId: request.workerId,
      priority: request.priority || 5,
      metadata: request.metadata || {},
      status: 'pending' as const,
      createdAt: new Date(),
      estimatedDuration: this.estimateDuration(request.prompt)
    };

    this.activeTasks.set(taskId, task);

    // Update health status
    if (this.healthService) {
      this.healthService.incrementTasks();
      this.healthService.setStatus('busy');
    }

    // Create streaming handler for future SSE support
    await this.streamingService.createStream(taskId);

    // Execute task using modular executor
    this.executeTaskAsync(taskId, request);

    return {
      taskId,
      status: 'pending',
      estimatedDuration: task.estimatedDuration
    };
  }

  private async executeTaskAsync(taskId: string, request: TaskSubmissionRequest): Promise<void> {
    try {
      // Start task execution
      const task = this.activeTasks.get(taskId);
      if (task) {
        task.status = 'running';
        
        // Stream status update
        await this.streamingService.broadcastEvent(taskId, {
          type: 'status',
          data: { status: 'running' },
          timestamp: new Date()
        });
      }

      // Execute using the pluggable executor
      const result = await this.taskExecutor.execute(taskId, request);
      
      // Update task status
      if (task) {
        task.status = result.status;
        task.completedAt = new Date();
        task.output = result.output;
        task.error = result.error;
      }

      // Stream completion event
      await this.streamingService.broadcastEvent(taskId, {
        type: 'complete',
        data: result,
        timestamp: new Date()
      });

      logger.info(`Task ${taskId} execution completed`, { 
        status: result.status,
        duration: result.duration 
      });

      // Update health metrics
      if (this.healthService) {
        this.healthService.decrementTasks();
        if (this.getActiveTaskCount() === 0) {
          this.healthService.setStatus('available');
        }
      }

      // Schedule cleanup
      setTimeout(() => {
        this.activeTasks.delete(taskId);
        this.streamingService.closeStream(taskId);
        logger.debug(`Task ${taskId} cleaned up`);
      }, 30000);

    } catch (error) {
      logger.error(`Task ${taskId} execution failed:`, error);
      
      const task = this.activeTasks.get(taskId);
      if (task) {
        task.status = 'failed';
        task.error = error instanceof Error ? error.message : String(error);
      }

      // Stream error event
      await this.streamingService.broadcastEvent(taskId, {
        type: 'error',
        data: { error: task?.error },
        timestamp: new Date()
      });

      // Update health metrics
      if (this.healthService) {
        this.healthService.decrementTasks();
        this.healthService.setStatus('error');
      }
    }
  }

  private estimateDuration(prompt: string): number {
    // Simple duration estimation based on prompt length
    const baseTime = 2000; // 2 seconds minimum
    const wordsEstimate = prompt.split(' ').length * 50; // 50ms per word
    return Math.min(baseTime + wordsEstimate, 30000); // Max 30 seconds for stub
  }

  getTaskStatus(taskId: string): any {
    const taskInfo = this.activeTasks.get(taskId);
    const executorStatus = this.taskExecutor.getStatus(taskId);
    
    return {
      ...taskInfo,
      executorStatus
    };
  }

  getActiveTasks(): Map<string, any> {
    return new Map(this.activeTasks);
  }

  getActiveTaskCount(): number {
    let activeCount = 0;
    for (const task of this.activeTasks.values()) {
      if (task.status === 'pending' || task.status === 'running') {
        activeCount++;
      }
    }
    return activeCount;
  }

  // Additional methods for PTY/SSE integration readiness
  
  async cancelTask(taskId: string): Promise<boolean> {
    const success = await this.taskExecutor.cancel(taskId);
    if (success) {
      const task = this.activeTasks.get(taskId);
      if (task) {
        task.status = 'cancelled';
        task.completedAt = new Date();
      }
      
      await this.streamingService.broadcastEvent(taskId, {
        type: 'status',
        data: { status: 'cancelled' },
        timestamp: new Date()
      });
    }
    return success;
  }

  async cleanup(): Promise<void> {
    await this.taskExecutor.cleanup();
    await this.streamingService.cleanup();
    
    logger.info('Task execution service cleaned up');
  }

  // Getters for integration points
  getTaskExecutor(): ITaskExecutor {
    return this.taskExecutor;
  }

  getStreamingService(): IStreamingService {
    return this.streamingService;
  }

  getFactory(): ExecutionFactory {
    return this.factory;
  }
}