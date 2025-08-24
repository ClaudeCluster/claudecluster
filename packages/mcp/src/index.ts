// Export main server class
export { MCPServer } from './server';
export { WorkerRegistry } from './worker-registry';
export { TaskManager } from './task-manager';

// Export configuration
export { config } from './config';
export { logger } from './logger';

// Export schemas and types
export * from './schemas';

// Re-export shared types for convenience
export type {
  TaskSubmissionRequest,
  TaskSubmissionResponse,
  TaskStatus,
  WorkerStatus,
  SSEEvent,
  SSEEventType
} from '@claudecluster/shared';