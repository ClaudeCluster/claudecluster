import { z } from 'zod';

// Task submission request schema
export const taskSubmissionRequestSchema = z.object({
  prompt: z.string().min(1, 'Prompt cannot be empty'),
  workerId: z.string().optional(),
  priority: z.number().int().min(1).max(10).default(5),
  metadata: z.record(z.unknown()).optional()
});

// Task submission response schema  
export const taskSubmissionResponseSchema = z.object({
  taskId: z.string(),
  status: z.enum(['pending', 'running', 'completed', 'failed', 'cancelled']),
  estimatedDuration: z.number().optional()
});

export type TaskSubmissionRequest = z.infer<typeof taskSubmissionRequestSchema>;
export type TaskSubmissionResponse = z.infer<typeof taskSubmissionResponseSchema>;

// Health check response schema
export const healthResponseSchema = z.object({
  status: z.enum(['available', 'busy', 'offline', 'error']),
  uptime: z.number(),
  currentTasks: z.number(),
  capabilities: z.object({
    maxConcurrentTasks: z.number(),
    supportedCommands: z.array(z.string()),
    environment: z.object({
      nodeVersion: z.string(),
      platform: z.string(),
      architecture: z.string()
    })
  }),
  id: z.string(),
  name: z.string(),
  version: z.string(),
  timestamp: z.string().datetime()
});

export type HealthResponse = z.infer<typeof healthResponseSchema>;