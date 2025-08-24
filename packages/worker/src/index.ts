import { Worker, WorkerStatus } from '@claudecluster/core';
import { WorkerService } from './worker-service';
import { TaskExecutor } from './task-executor';

export class ClaudeWorker implements Worker {
  public id: string;
  public name: string;
  public status: WorkerStatus;
  public capabilities: string[];
  public currentTask?: string;
  public lastHeartbeat: Date;
  public metadata: Record<string, any>;

  private workerService: WorkerService;
  private taskExecutor: TaskExecutor;

  constructor(id: string, name: string, capabilities: string[] = []) {
    this.id = id;
    this.name = name;
    this.status = WorkerStatus.IDLE;
    this.capabilities = capabilities;
    this.lastHeartbeat = new Date();
    this.metadata = {};

    this.workerService = new WorkerService(this);
    this.taskExecutor = new TaskExecutor(this);
  }

  async start(): Promise<void> {
    console.log(`🚀 Starting ClaudeWorker: ${this.name} (${this.id})`);
    await this.workerService.start();
    this.status = WorkerStatus.IDLE;
  }

  async stop(): Promise<void> {
    console.log(`🛑 Stopping ClaudeWorker: ${this.name}`);
    await this.workerService.stop();
    this.status = WorkerStatus.OFFLINE;
  }

  async executeTask(taskId: string, taskData: any): Promise<any> {
    this.status = WorkerStatus.BUSY;
    this.currentTask = taskId;
    
    try {
      const result = await this.taskExecutor.execute(taskData);
      this.status = WorkerStatus.IDLE;
      this.currentTask = undefined;
      return result;
    } catch (error) {
      this.status = WorkerStatus.ERROR;
      this.currentTask = undefined;
      throw error;
    }
  }

  updateHeartbeat(): void {
    this.lastHeartbeat = new Date();
  }

  getStatus(): WorkerStatus {
    return this.status;
  }
}

// Export the main worker class
export { WorkerService } from './worker-service';
export { TaskExecutor } from './task-executor';
