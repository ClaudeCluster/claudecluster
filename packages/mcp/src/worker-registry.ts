import axios from 'axios';
import { config } from './config';
import { logger } from './logger';
import { WorkerInfo } from './schemas';

export class WorkerRegistry {
  private workers: Map<string, WorkerInfo> = new Map();
  private healthCheckTimer?: NodeJS.Timeout;

  constructor() {
    // Initialize with static configuration for Phase 0
    this.initializeStaticWorkers();
  }

  async initialize(): Promise<void> {
    logger.info('Initializing worker registry with static configuration');
    
    // Perform initial health checks
    await this.performHealthChecks();
    
    // Start periodic health checks
    this.startHealthChecks();
    
    logger.info(`Worker registry initialized with ${this.workers.size} workers`);
  }

  private initializeStaticWorkers(): void {
    // Static worker configuration for Phase 0
    config.workerEndpoints.forEach((endpoint, index) => {
      const workerId = `worker-${index + 1}`;
      const worker: WorkerInfo = {
        id: workerId,
        endpoint,
        status: 'offline', // Will be updated by health checks
        activeTasks: 0,
        maxTasks: 5, // Default max tasks per worker
        lastHealthCheck: new Date(),
        capabilities: ['pty', 'streaming'],
        version: undefined,
        uptime: 0
      };
      
      this.workers.set(workerId, worker);
      logger.debug(`Registered static worker: ${workerId} at ${endpoint}`);
    });
  }

  private startHealthChecks(): void {
    this.healthCheckTimer = setInterval(async () => {
      await this.performHealthChecks();
    }, config.healthCheckIntervalMs);

    logger.debug(`Health checks scheduled every ${config.healthCheckIntervalMs}ms`);
  }

  private async performHealthChecks(): Promise<void> {
    const healthCheckPromises = Array.from(this.workers.entries()).map(async ([workerId, worker]) => {
      try {
        const response = await axios.get(`${worker.endpoint}/hello`, {
          timeout: config.requestTimeoutMs,
          validateStatus: (status) => status === 200
        });

        const healthData = response.data;
        
        // Update worker status based on health check
        const updatedWorker: WorkerInfo = {
          ...worker,
          status: healthData.status === 'available' || healthData.status === 'busy' ? 
            (healthData.activeTasks > 0 ? 'busy' : 'available') : 'error',
          activeTasks: healthData.activeTasks || 0,
          lastHealthCheck: new Date(),
          version: healthData.version,
          uptime: healthData.uptime
        };

        this.workers.set(workerId, updatedWorker);
        
        logger.debug(`Health check successful for worker ${workerId}`, {
          status: updatedWorker.status,
          activeTasks: updatedWorker.activeTasks
        });

      } catch (error) {
        // Worker is offline or unhealthy
        const updatedWorker: WorkerInfo = {
          ...worker,
          status: 'offline',
          lastHealthCheck: new Date()
        };
        
        this.workers.set(workerId, updatedWorker);
        
        logger.warn(`Health check failed for worker ${workerId}:`, {
          error: error instanceof Error ? error.message : String(error),
          endpoint: worker.endpoint
        });
      }
    });

    await Promise.allSettled(healthCheckPromises);
  }

  async getAvailableWorkers(): Promise<WorkerInfo[]> {
    return Array.from(this.workers.values()).filter(worker => 
      worker.status === 'available' || 
      (worker.status === 'busy' && worker.activeTasks < worker.maxTasks)
    );
  }

  async getAllWorkers(): Promise<WorkerInfo[]> {
    return Array.from(this.workers.values());
  }

  async getWorker(workerId: string): Promise<WorkerInfo | undefined> {
    return this.workers.get(workerId);
  }

  async getWorkerByEndpoint(endpoint: string): Promise<WorkerInfo | undefined> {
    return Array.from(this.workers.values()).find(worker => worker.endpoint === endpoint);
  }

  async selectWorkerForTask(): Promise<WorkerInfo | null> {
    const availableWorkers = await this.getAvailableWorkers();
    
    if (availableWorkers.length === 0) {
      return null;
    }

    // Simple round-robin selection for Phase 0
    // Sort by active tasks (least loaded first)
    availableWorkers.sort((a, b) => a.activeTasks - b.activeTasks);
    
    const selectedWorker = availableWorkers[0];
    
    logger.debug(`Selected worker ${selectedWorker.id} for task assignment`, {
      activeTasks: selectedWorker.activeTasks,
      maxTasks: selectedWorker.maxTasks
    });

    return selectedWorker;
  }

  async updateWorkerTaskCount(workerId: string, increment: boolean): Promise<void> {
    const worker = this.workers.get(workerId);
    if (worker) {
      const updatedWorker: WorkerInfo = {
        ...worker,
        activeTasks: Math.max(0, worker.activeTasks + (increment ? 1 : -1)),
        status: worker.activeTasks >= worker.maxTasks ? 'busy' : 'available'
      };
      
      this.workers.set(workerId, updatedWorker);
      
      logger.debug(`Updated task count for worker ${workerId}`, {
        activeTasks: updatedWorker.activeTasks,
        status: updatedWorker.status
      });
    }
  }

  async getWorkersSummary(): Promise<{
    total: number;
    available: number;
    busy: number;
    offline: number;
    error: number;
  }> {
    const workers = Array.from(this.workers.values());
    
    return {
      total: workers.length,
      available: workers.filter(w => w.status === 'available').length,
      busy: workers.filter(w => w.status === 'busy').length,
      offline: workers.filter(w => w.status === 'offline').length,
      error: workers.filter(w => w.status === 'error').length
    };
  }

  async cleanup(): Promise<void> {
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
      this.healthCheckTimer = undefined;
    }
    
    logger.info('Worker registry cleaned up');
  }

  // Method to add workers dynamically (for future phases)
  async addWorker(workerId: string, endpoint: string): Promise<void> {
    const worker: WorkerInfo = {
      id: workerId,
      endpoint,
      status: 'offline',
      activeTasks: 0,
      maxTasks: 5,
      lastHealthCheck: new Date(),
      capabilities: ['pty', 'streaming'],
      version: undefined,
      uptime: 0
    };
    
    this.workers.set(workerId, worker);
    logger.info(`Added new worker: ${workerId} at ${endpoint}`);
    
    // Perform immediate health check for new worker
    await this.performHealthChecks();
  }

  // Method to remove workers dynamically (for future phases)
  async removeWorker(workerId: string): Promise<boolean> {
    const removed = this.workers.delete(workerId);
    if (removed) {
      logger.info(`Removed worker: ${workerId}`);
    }
    return removed;
  }

  // Get registry statistics for monitoring
  getRegistryStats(): {
    totalWorkers: number;
    healthyWorkers: number;
    totalActiveTasks: number;
    lastHealthCheckTime: Date | null;
  } {
    const workers = Array.from(this.workers.values());
    const lastHealthCheck = workers.reduce((latest, worker) => 
      !latest || worker.lastHealthCheck > latest ? worker.lastHealthCheck : latest, 
      null as Date | null
    );

    return {
      totalWorkers: workers.length,
      healthyWorkers: workers.filter(w => w.status === 'available' || w.status === 'busy').length,
      totalActiveTasks: workers.reduce((sum, worker) => sum + worker.activeTasks, 0),
      lastHealthCheckTime: lastHealthCheck
    };
  }
}