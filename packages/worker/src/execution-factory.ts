import { ITaskExecutor, IStreamingService } from './interfaces';
import { StubTaskExecutor } from './executors/stub-executor';
import { PTYTaskExecutor } from './executors/pty-executor';
import { StubStreamingService } from './streaming/stub-streaming';
import { logger } from './logger';
import { config } from './config';

/**
 * Factory for creating task execution components
 * Handles selection between stub and production implementations
 */
export class ExecutionFactory {
  private static instance?: ExecutionFactory;

  static getInstance(): ExecutionFactory {
    if (!this.instance) {
      this.instance = new ExecutionFactory();
    }
    return this.instance;
  }

  createTaskExecutor(type?: 'stub' | 'pty'): ITaskExecutor {
    const executorType = type || this.detectExecutorType();
    
    logger.info(`Creating ${executorType} task executor`);
    
    switch (executorType) {
      case 'pty':
        return new PTYTaskExecutor();
      case 'stub':
      default:
        return new StubTaskExecutor();
    }
  }

  createStreamingService(type?: 'stub' | 'sse'): IStreamingService {
    const serviceType = type || this.detectStreamingType();
    
    logger.info(`Creating ${serviceType} streaming service`);
    
    switch (serviceType) {
      case 'sse':
        // TODO: Implement SSEStreamingService in Task 5
        logger.warn('SSE streaming service not yet implemented, using stub');
        return new StubStreamingService();
      case 'stub':
      default:
        return new StubStreamingService();
    }
  }

  private detectExecutorType(): 'stub' | 'pty' {
    // Auto-detect based on environment and availability
    const forceType = process.env.EXECUTOR_TYPE as 'stub' | 'pty';
    if (forceType) {
      return forceType;
    }

    // Check if we're in development mode
    if (config.nodeEnv === 'development') {
      return 'stub';
    }

    // Check if PTY dependencies are available
    try {
      require.resolve('node-pty');
      return 'pty';
    } catch {
      logger.warn('node-pty not available, using stub executor');
      return 'stub';
    }
  }

  private detectStreamingType(): 'stub' | 'sse' {
    const forceType = process.env.STREAMING_TYPE as 'stub' | 'sse';
    if (forceType) {
      return forceType;
    }

    // For now, always use stub until SSE is implemented
    return 'stub';
  }

  // Helper method to check if PTY is available
  isPtyAvailable(): boolean {
    try {
      require.resolve('node-pty');
      return true;
    } catch {
      return false;
    }
  }

  // Get factory configuration info
  getFactoryInfo() {
    return {
      executorType: this.detectExecutorType(),
      streamingType: this.detectStreamingType(),
      ptyAvailable: this.isPtyAvailable(),
      environment: config.nodeEnv,
      claudeCliPath: config.claudeCliPath
    };
  }
}