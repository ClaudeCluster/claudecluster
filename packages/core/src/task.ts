// Task management implementation
import { Task as ITask } from './types';

export class TaskManager {
  private tasks: Map<string, ITask> = new Map();

  addTask(task: ITask): void {
    this.tasks.set(task.id, task);
  }

  getTask(id: string): ITask | undefined {
    return this.tasks.get(id);
  }

  removeTask(id: string): boolean {
    return this.tasks.delete(id);
  }
}