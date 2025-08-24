import { z } from 'zod';
import type { 
  TaskSubmissionRequest as SharedTaskSubmissionRequest,
  TaskSubmissionResponse as SharedTaskSubmissionResponse,
  TaskStatus as SharedTaskStatus,
  WorkerStatus as SharedWorkerStatus,
  SSEEventType as SharedSSEEventType
} from '@claudecluster/shared';

// Zod schemas that match shared types
const sharedTaskStatusSchema = z.enum(['pending', 'running', 'completed', 'failed', 'cancelled']);
const sharedWorkerStatusSchema = z.enum(['available', 'busy', 'offline', 'error']);

// Task submission schemas
export const taskSubmissionRequestSchema = z.object({
  prompt: z.string().min(1, 'Prompt cannot be empty').max(10000, 'Prompt too long'),
  workerId: z.string().optional(),
  priority: z.number().int().min(1).max(10).default(5),
  metadata: z.record(z.unknown()).optional(),
  timeoutMs: z.number().int().min(1000).max(600000).optional(), // 1 second to 10 minutes
});

export const taskSubmissionResponseSchema = z.object({
  taskId: z.string().uuid(),
  status: z.enum(['pending', 'assigned', 'running', 'completed', 'failed', 'cancelled']), // MCP adds 'assigned' status
  assignedWorker: z.string().url().optional(),
  estimatedDuration: z.number().int().positive().optional(),
  streamUrl: z.string().url().optional(),
});

// Worker registry schemas
export const workerInfoSchema = z.object({
  id: z.string(),
  endpoint: z.string().url(),
  status: sharedWorkerStatusSchema,
  activeTasks: z.number().int().min(0),
  maxTasks: z.number().int().positive(),
  lastHealthCheck: z.date(),
  capabilities: z.array(z.string()).default(['pty', 'streaming']),
  version: z.string().optional(),
  uptime: z.number().int().min(0).optional(),
});

export const workersListResponseSchema = z.object({
  workers: z.array(workerInfoSchema),
  totalWorkers: z.number().int().min(0),
  availableWorkers: z.number().int().min(0),
  totalActiveTasks: z.number().int().min(0),
});

// Task status schemas
export const taskStatusSchema = z.object({
  taskId: z.string().uuid(),
  status: z.enum(['pending', 'assigned', 'running', 'completed', 'failed', 'cancelled']),
  assignedWorker: z.string().url().optional(),
  createdAt: z.date(),
  startedAt: z.date().optional(),
  completedAt: z.date().optional(),
  output: z.string().optional(),
  error: z.string().optional(),
  progress: z.number().min(0).max(100).optional(),
  duration: z.number().int().min(0).optional(), // milliseconds
});

// Health check schemas
export const healthResponseSchema = z.object({
  status: z.enum(['healthy', 'degraded', 'unhealthy']),
  timestamp: z.date(),
  version: z.string(),
  uptime: z.number().int().min(0),
  workers: z.object({
    total: z.number().int().min(0),
    available: z.number().int().min(0),
    offline: z.number().int().min(0),
  }),
  tasks: z.object({
    active: z.number().int().min(0),
    completed: z.number().int().min(0),
    failed: z.number().int().min(0),
  }),
  systemInfo: z.object({
    nodeVersion: z.string(),
    platform: z.string(),
    arch: z.string(),
    memoryUsage: z.record(z.number()).optional(),
  }).optional(),
});

// Error response schema
export const errorResponseSchema = z.object({
  error: z.string(),
  message: z.string(),
  code: z.string().optional(),
  details: z.unknown().optional(),
  timestamp: z.date().optional(),
});

// Export types for TypeScript
export type TaskSubmissionRequest = z.infer<typeof taskSubmissionRequestSchema>;
export type TaskSubmissionResponse = z.infer<typeof taskSubmissionResponseSchema>;
export type WorkerInfo = z.infer<typeof workerInfoSchema>;
export type WorkersListResponse = z.infer<typeof workersListResponseSchema>;
export type TaskStatus = z.infer<typeof taskStatusSchema>;
export type HealthResponse = z.infer<typeof healthResponseSchema>;
export type ErrorResponse = z.infer<typeof errorResponseSchema>;