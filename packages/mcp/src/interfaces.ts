/**
 * Interfaces for extensible worker management in future phases
 * These define contracts for dynamic worker discovery and management
 */

import { WorkerInfo } from './schemas';

// Worker discovery interface for future dynamic worker management
export interface IWorkerDiscovery {
  /**
   * Discover available workers in the environment
   * @returns Promise resolving to array of discovered worker endpoints
   */
  discoverWorkers(): Promise<string[]>;

  /**
   * Start periodic worker discovery
   * @param intervalMs - Discovery interval in milliseconds
   */
  startDiscovery(intervalMs: number): void;

  /**
   * Stop periodic worker discovery
   */
  stopDiscovery(): void;

  /**
   * Event emitter for worker lifecycle events
   */
  on(event: 'worker-discovered' | 'worker-lost', listener: (endpoint: string) => void): void;
}

// Worker selection strategy interface
export interface IWorkerSelectionStrategy {
  /**
   * Select the best worker for a given task
   * @param availableWorkers - List of available workers
   * @param taskMetadata - Task metadata for selection criteria
   * @returns Selected worker or null if none suitable
   */
  selectWorker(
    availableWorkers: WorkerInfo[], 
    taskMetadata?: Record<string, unknown>
  ): WorkerInfo | null;
}

// Task routing interface for advanced routing logic
export interface ITaskRouter {
  /**
   * Route a task to the most appropriate worker
   * @param taskId - Unique task identifier
   * @param taskRequest - Task submission request
   * @returns Promise resolving to assigned worker info
   */
  routeTask(taskId: string, taskRequest: any): Promise<WorkerInfo>;

  /**
   * Handle task completion and update routing state
   * @param taskId - Task identifier
   * @param workerId - Worker identifier
   * @param result - Task execution result
   */
  handleTaskCompletion(
    taskId: string, 
    workerId: string, 
    result: any
  ): Promise<void>;
}

// Load balancing interface for different strategies
export interface ILoadBalancer {
  /**
   * Balance load across available workers
   * @param workers - Available workers
   * @param currentLoad - Current system load metrics
   * @returns Recommended worker distribution
   */
  balanceLoad(
    workers: WorkerInfo[],
    currentLoad: Record<string, number>
  ): Record<string, number>; // workerId -> recommended task count
}

// Worker pool management interface
export interface IWorkerPool {
  /**
   * Scale the worker pool up or down based on demand
   * @param targetSize - Desired number of workers
   * @param scaleReason - Reason for scaling (monitoring, manual, etc.)
   */
  scalePool(targetSize: number, scaleReason: string): Promise<void>;

  /**
   * Get current pool statistics
   */
  getPoolStats(): {
    activeWorkers: number;
    targetSize: number;
    scalingInProgress: boolean;
    lastScaleTime: Date | null;
  };
}

// Monitoring and observability interface
export interface IWorkerMonitor {
  /**
   * Start monitoring worker health and performance
   */
  startMonitoring(): void;

  /**
   * Stop monitoring
   */
  stopMonitoring(): void;

  /**
   * Get worker performance metrics
   * @param workerId - Worker to get metrics for
   * @param timeRangeMs - Time range for metrics
   */
  getWorkerMetrics(
    workerId: string, 
    timeRangeMs: number
  ): Promise<{
    taskCount: number;
    averageTaskDuration: number;
    errorRate: number;
    cpuUsage?: number;
    memoryUsage?: number;
  }>;
}

// Configuration interface for different deployment modes
export interface IWorkerConfiguration {
  /**
   * Configure workers for different environments
   * @param environment - Target environment (local, docker, cloud-run)
   * @param config - Environment-specific configuration
   */
  configureForEnvironment(
    environment: 'local' | 'docker' | 'cloud-run',
    config: Record<string, unknown>
  ): Promise<void>;

  /**
   * Get current configuration
   */
  getCurrentConfiguration(): {
    environment: string;
    workerCount: number;
    configuration: Record<string, unknown>;
  };
}

// Event emitter interface for worker registry events
export interface IWorkerRegistryEvents {
  on(event: 'worker-added', listener: (worker: WorkerInfo) => void): void;
  on(event: 'worker-removed', listener: (workerId: string) => void): void;
  on(event: 'worker-status-changed', listener: (workerId: string, oldStatus: string, newStatus: string) => void): void;
  on(event: 'health-check-failed', listener: (workerId: string, error: Error) => void): void;
  on(event: 'registry-empty', listener: () => void): void;
  
  emit(event: string, ...args: any[]): boolean;
}

/**
 * Concrete implementations for Phase 0
 * These are simple implementations that will be extended in future phases
 */

// Round-robin worker selection strategy (Phase 0 implementation)
export class RoundRobinStrategy implements IWorkerSelectionStrategy {
  private lastSelectedIndex = -1;

  selectWorker(availableWorkers: WorkerInfo[]): WorkerInfo | null {
    if (availableWorkers.length === 0) return null;
    
    this.lastSelectedIndex = (this.lastSelectedIndex + 1) % availableWorkers.length;
    return availableWorkers[this.lastSelectedIndex];
  }
}

// Least-loaded worker selection strategy
export class LeastLoadedStrategy implements IWorkerSelectionStrategy {
  selectWorker(availableWorkers: WorkerInfo[]): WorkerInfo | null {
    if (availableWorkers.length === 0) return null;
    
    return availableWorkers.reduce((least, current) => 
      current.activeTasks < least.activeTasks ? current : least
    );
  }
}

// Static worker discovery (Phase 0 - no actual discovery)
export class StaticWorkerDiscovery implements IWorkerDiscovery {
  private listeners: Map<string, ((endpoint: string) => void)[]> = new Map();

  async discoverWorkers(): Promise<string[]> {
    // Phase 0: Return empty array as workers are statically configured
    return [];
  }

  startDiscovery(_intervalMs: number): void {
    // Phase 0: No-op
  }

  stopDiscovery(): void {
    // Phase 0: No-op
  }

  on(event: 'worker-discovered' | 'worker-lost', listener: (endpoint: string) => void): void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, []);
    }
    this.listeners.get(event)!.push(listener);
  }
}

/**
 * Registry extension points for future phases
 */
export interface IExtensibleWorkerRegistry {
  // Plugin system for custom worker types
  registerWorkerType(typeName: string, factory: (config: any) => Promise<WorkerInfo>): void;
  
  // Custom health check strategies
  setHealthCheckStrategy(strategy: (worker: WorkerInfo) => Promise<boolean>): void;
  
  // Custom worker selection algorithms
  setSelectionStrategy(strategy: IWorkerSelectionStrategy): void;
  
  // Load balancer integration
  setLoadBalancer(balancer: ILoadBalancer): void;
  
  // Monitoring integration
  setMonitor(monitor: IWorkerMonitor): void;
}

/**
 * Extension hooks for custom worker management logic
 */
export interface IWorkerLifecycleHooks {
  beforeWorkerAdd?(worker: WorkerInfo): Promise<boolean>; // Return false to prevent addition
  afterWorkerAdd?(worker: WorkerInfo): Promise<void>;
  beforeWorkerRemove?(workerId: string): Promise<boolean>; // Return false to prevent removal
  afterWorkerRemove?(workerId: string): Promise<void>;
  onWorkerHealthChange?(workerId: string, healthy: boolean): Promise<void>;
  onTaskAssignment?(taskId: string, workerId: string): Promise<void>;
  onTaskCompletion?(taskId: string, workerId: string, success: boolean): Promise<void>;
}

export type WorkerManagementMode = 'static' | 'dynamic' | 'auto-scaling' | 'hybrid';