/**
 * @fileoverview ClaudeCluster Driver Package
 * 
 * This package provides the Driver implementation for ClaudeCluster,
 * responsible for orchestrating task execution across multiple workers.
 */

// Main Driver implementation
export { ClaudeDriver, createDriver, startDriverServer } from './driver.js';
export type { ClaudeDriverConfig, DriverEvents } from './driver.js';

// Task Orchestrator
export { TaskOrchestrator } from './orchestrator/index.js';
export type { 
  OrchestratorConfig, 
  TaskExecutionContext,
  OrchestratorEvents,
  OrchestrationStats 
} from './orchestrator/index.js';

// Task Scheduler
export { TaskScheduler } from './scheduler/index.js';
export type { 
  SchedulerConfig, 
  TaskExecutionPlan,
  SchedulerStats,
  SchedulerEvents 
} from './scheduler/index.js';

// HTTP API Server
export { DriverServer } from './server/index.js';
export type { 
  DriverServerConfig 
} from './server/index.js';

// Re-export core types for convenience
export type {
  Task,
  TaskResult,
  TaskProgress,
  TaskStatus,
  TaskPriority,
  TaskCategory,
  Worker,
  WorkerStatus,
  WorkerCapabilities,
  Driver,
  DriverStatus
} from '@claudecluster/core';