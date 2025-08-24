import { WorkerStatus } from '@claudecluster/shared';
import { HealthResponse } from './schemas';
import { config } from './config';

export class HealthService {
  private startTime: Date;
  private currentTasks: number = 0;
  private status: WorkerStatus = 'available';

  constructor() {
    this.startTime = new Date();
  }

  public getHealthInfo(actualTaskCount?: number): HealthResponse {
    return {
      status: this.status,
      uptime: Math.floor((Date.now() - this.startTime.getTime()) / 1000),
      currentTasks: actualTaskCount ?? this.currentTasks,
      capabilities: {
        maxConcurrentTasks: 1, // For Phase 0, single task execution
        supportedCommands: ['claude-code'],
        environment: {
          nodeVersion: process.version,
          platform: process.platform,
          architecture: process.arch
        }
      },
      id: process.env.WORKER_ID || 'worker-1',
      name: process.env.WORKER_NAME || 'ClaudeWorker-1',
      version: process.env.npm_package_version || '0.1.0',
      timestamp: new Date().toISOString()
    };
  }

  public setStatus(status: WorkerStatus): void {
    this.status = status;
  }

  public getStatus(): WorkerStatus {
    return this.status;
  }

  public incrementTasks(): void {
    this.currentTasks++;
  }

  public decrementTasks(): void {
    if (this.currentTasks > 0) {
      this.currentTasks--;
    }
  }

  public getCurrentTasks(): number {
    return this.currentTasks;
  }
}