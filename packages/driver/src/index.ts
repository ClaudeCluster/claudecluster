import { Driver, DriverStatus, Task, Worker } from '@claudecluster/core';
import { SimpleOrchestrator as Orchestrator } from './simple-orchestrator';
import { TaskScheduler } from './task-scheduler';
import { WorkerManager } from './worker-manager';

export class ClaudeDriver implements Driver {
  public id: string;
  public name: string;
  public status: DriverStatus;
  public workers: string[];
  public tasks: string[];
  public metadata: Record<string, any>;

  private orchestrator: Orchestrator;
  private taskScheduler: TaskScheduler;
  private workerManager: WorkerManager;

  constructor(id: string, name: string) {
    this.id = id;
    this.name = name;
    this.status = DriverStatus.INACTIVE;
    this.workers = [];
    this.tasks = [];
    this.metadata = {};

    this.orchestrator = new Orchestrator();
    this.taskScheduler = new TaskScheduler();
    this.workerManager = new WorkerManager();
  }

  async start(): Promise<void> {
    console.log(`🚀 Starting ClaudeDriver: ${this.name} (${this.id})`);
    
    try {
      await this.workerManager.initialize();
      await this.taskScheduler.initialize();
      await this.orchestrator.start();
      
      this.status = DriverStatus.ACTIVE;
      console.log(`✅ ClaudeDriver ${this.name} is now active`);
    } catch (error) {
      console.error(`❌ Failed to start ClaudeDriver: ${error}`);
      this.status = DriverStatus.ERROR;
      throw error;
    }
  }

  async stop(): Promise<void> {
    console.log(`🛑 Stopping ClaudeDriver: ${this.name}`);
    
    try {
      await this.orchestrator.stop();
      await this.taskScheduler.stop();
      await this.workerManager.stop();
      
      this.status = DriverStatus.INACTIVE;
      console.log(`✅ ClaudeDriver ${this.name} stopped successfully`);
    } catch (error) {
      console.error(`❌ Error stopping ClaudeDriver: ${error}`);
      throw error;
    }
  }

  async addTask(task: Task): Promise<void> {
    this.tasks.push(task.id);
    await this.taskScheduler.addTask(task);
  }

  async removeTask(taskId: string): Promise<void> {
    const index = this.tasks.indexOf(taskId);
    if (index > -1) {
      this.tasks.splice(index, 1);
    }
    await this.taskScheduler.removeTask(taskId);
  }

  async registerWorker(worker: Worker): Promise<void> {
    this.workers.push(worker.id);
    await this.workerManager.registerWorker(worker);
  }

  async unregisterWorker(workerId: string): Promise<void> {
    const index = this.workers.indexOf(workerId);
    if (index > -1) {
      this.workers.splice(index, 1);
    }
    await this.workerManager.unregisterWorker(workerId);
  }

  getStatus(): DriverStatus {
    return this.status;
  }

  getWorkerCount(): number {
    return this.workers.length;
  }

  getTaskCount(): number {
    return this.tasks.length;
  }
}

// Export the main driver class and related components
export { Orchestrator } from './orchestrator';
export { TaskScheduler } from './task-scheduler';
export { WorkerManager } from './worker-manager';
