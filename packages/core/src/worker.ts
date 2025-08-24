// Worker management implementation
import { Worker as IWorker } from './types';

export class WorkerRegistry {
  private workers: Map<string, IWorker> = new Map();

  registerWorker(worker: IWorker): void {
    this.workers.set(worker.id, worker);
  }

  getWorker(id: string): IWorker | undefined {
    return this.workers.get(id);
  }

  unregisterWorker(id: string): boolean {
    return this.workers.delete(id);
  }

  getAllWorkers(): IWorker[] {
    return Array.from(this.workers.values());
  }
}