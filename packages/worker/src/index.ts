import { Worker, WorkerStatus } from '@claudecluster/shared';
import { WorkerServer } from './server';
import { TaskExecutor } from './task-executor';

export class ClaudeWorker implements Worker {
  public id: string;
  public name: string;
  public status: WorkerStatus;
  public capabilities: string[];
  public currentTask?: string;
  public lastHeartbeat: Date;
  public metadata: Record<string, any>;

  private server: WorkerServer;
  private taskExecutor: TaskExecutor;

  constructor(id: string, name: string, capabilities: string[] = []) {
    this.id = id;
    this.name = name;
    this.status = 'available';
    this.capabilities = capabilities;
    this.lastHeartbeat = new Date();
    this.metadata = {};

    this.server = new WorkerServer();
    this.taskExecutor = new TaskExecutor();
  }

  async start(): Promise<void> {
    console.log(`🚀 Starting ClaudeWorker: ${this.name} (${this.id})`);
    await this.server.start();
    this.status = 'available';
    this.server.getHealthService().setStatus('available');
  }

  async stop(): Promise<void> {
    console.log(`🛑 Stopping ClaudeWorker: ${this.name}`);
    await this.server.stop();
    this.status = 'offline';
    this.server.getHealthService().setStatus('offline');
  }

  async executeTask(taskId: string, taskData: any): Promise<any> {
    this.status = 'busy';
    this.currentTask = taskId;
    this.server.getHealthService().setStatus('busy');
    this.server.getHealthService().incrementTasks();
    
    try {
      const result = await this.taskExecutor.execute(taskData);
      this.status = 'available';
      this.currentTask = undefined;
      this.server.getHealthService().setStatus('available');
      this.server.getHealthService().decrementTasks();
      return result;
    } catch (error) {
      this.status = 'error';
      this.currentTask = undefined;
      this.server.getHealthService().setStatus('error');
      this.server.getHealthService().decrementTasks();
      throw error;
    }
  }

  updateHeartbeat(): void {
    this.lastHeartbeat = new Date();
  }

  getStatus(): WorkerStatus {
    return this.status;
  }

  getServer(): WorkerServer {
    return this.server;
  }
}

// Export the main worker class
export { WorkerService } from './worker-service';
export { TaskExecutor } from './task-executor';
