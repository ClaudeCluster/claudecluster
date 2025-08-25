/**
 * @fileoverview Communication protocol types for ClaudeCluster
 */

import { z } from 'zod';
import type { TaskProgress } from './task.js';
import { TaskStatus } from './task.js';
import { WorkerStatus } from './worker.js';

/**
 * Message type enumeration
 */
export enum MessageType {
  // Driver to Worker
  TASK_ASSIGN = 'task_assign',
  TASK_CANCEL = 'task_cancel',
  WORKER_SHUTDOWN = 'worker_shutdown',
  HEALTH_CHECK = 'health_check',
  
  // Worker to Driver
  TASK_PROGRESS = 'task_progress',
  TASK_COMPLETED = 'task_completed',
  TASK_FAILED = 'task_failed',
  WORKER_STATUS = 'worker_status',
  HEALTH_RESPONSE = 'health_response',
  
  // Bidirectional
  HEARTBEAT = 'heartbeat',
  ERROR = 'error',
  ACK = 'ack'
}

/**
 * Message priority levels
 */
export enum MessagePriority {
  LOW = 'low',
  NORMAL = 'normal',
  HIGH = 'high',
  CRITICAL = 'critical'
}

/**
 * Base message interface
 */
export interface BaseMessage {
  readonly id: string;
  readonly type: MessageType;
  readonly priority: MessagePriority;
  readonly timestamp: Date;
  readonly senderId: string;
  readonly receiverId?: string; // optional for broadcast messages
  readonly correlationId?: string; // for request/response tracking
  readonly ttl?: number; // time-to-live in milliseconds
}

/**
 * Task assignment message
 */
export interface TaskAssignMessage extends BaseMessage {
  readonly type: MessageType.TASK_ASSIGN;
  readonly payload: {
    readonly taskId: string;
    readonly title: string;
    readonly description: string;
    readonly context: Record<string, unknown>;
    readonly priority: string;
    readonly timeout?: number;
  };
}

/**
 * Task progress update message
 */
export interface TaskProgressMessage extends BaseMessage {
  readonly type: MessageType.TASK_PROGRESS;
  readonly payload: {
    readonly taskId: string;
    readonly progress: TaskProgress;
    readonly output?: string;
    readonly logs?: readonly string[];
  };
}

/**
 * Task completion message
 */
export interface TaskCompletedMessage extends BaseMessage {
  readonly type: MessageType.TASK_COMPLETED;
  readonly payload: {
    readonly taskId: string;
    readonly result: {
      readonly output?: string;
      readonly artifacts: readonly Record<string, unknown>[];
      readonly metrics: Record<string, unknown>;
      readonly logs: readonly string[];
      readonly exitCode?: number;
    };
  };
}

/**
 * Task failure message
 */
export interface TaskFailedMessage extends BaseMessage {
  readonly type: MessageType.TASK_FAILED;
  readonly payload: {
    readonly taskId: string;
    readonly error: string;
    readonly stackTrace?: string;
    readonly logs?: readonly string[];
    readonly retryable: boolean;
  };
}

/**
 * Worker status update message
 */
export interface WorkerStatusMessage extends BaseMessage {
  readonly type: MessageType.WORKER_STATUS;
  readonly payload: {
    readonly status: WorkerStatus;
    readonly resources: {
      readonly cpuUsage: number;
      readonly memoryUsage: number;
      readonly diskUsage: number;
    };
    readonly currentTasks: readonly string[];
    readonly capabilities?: Record<string, unknown>;
  };
}

/**
 * Health check message
 */
export interface HealthCheckMessage extends BaseMessage {
  readonly type: MessageType.HEALTH_CHECK;
  readonly payload: {
    readonly requestId: string;
    readonly timestamp: Date;
  };
}

/**
 * Health response message
 */
export interface HealthResponseMessage extends BaseMessage {
  readonly type: MessageType.HEALTH_RESPONSE;
  readonly payload: {
    readonly requestId: string;
    readonly status: 'healthy' | 'unhealthy' | 'degraded';
    readonly uptime: number;
    readonly responseTime: number;
    readonly details?: Record<string, unknown>;
  };
}

/**
 * Heartbeat message
 */
export interface HeartbeatMessage extends BaseMessage {
  readonly type: MessageType.HEARTBEAT;
  readonly payload: {
    readonly sequence: number;
    readonly timestamp: Date;
  };
}

/**
 * Error message
 */
export interface ErrorMessage extends BaseMessage {
  readonly type: MessageType.ERROR;
  readonly payload: {
    readonly code: string;
    readonly message: string;
    readonly details?: Record<string, unknown>;
    readonly retryable: boolean;
  };
}

/**
 * Acknowledgment message
 */
export interface AckMessage extends BaseMessage {
  readonly type: MessageType.ACK;
  readonly payload: {
    readonly originalMessageId: string;
    readonly status: 'received' | 'processed' | 'failed';
    readonly details?: string;
  };
}

/**
 * Union type for all message types
 */
export type Message = 
  | TaskAssignMessage
  | TaskProgressMessage
  | TaskCompletedMessage
  | TaskFailedMessage
  | WorkerStatusMessage
  | HealthCheckMessage
  | HealthResponseMessage
  | HeartbeatMessage
  | ErrorMessage
  | AckMessage;

/**
 * Command interface for driver instructions
 */
export interface Command extends BaseMessage {
  readonly command: string;
  readonly parameters: Record<string, unknown>;
  readonly expectsResponse: boolean;
}

/**
 * Event interface for system notifications
 */
export interface Event extends BaseMessage {
  readonly eventType: string;
  readonly data: Record<string, unknown>;
  readonly tags?: readonly string[];
}

/**
 * Message delivery options
 */
export interface MessageDeliveryOptions {
  readonly timeout?: number; // milliseconds
  readonly retryAttempts?: number;
  readonly retryDelay?: number; // milliseconds
  readonly persistent?: boolean; // store until delivered
  readonly ordered?: boolean; // maintain delivery order
}

/**
 * Message handler function type
 */
export type MessageHandler<T extends Message = Message> = (
  message: T,
  context: MessageContext
) => Promise<void | Message>;

/**
 * Message context information
 */
export interface MessageContext {
  readonly connectionId: string;
  readonly receivedAt: Date;
  readonly metadata?: Record<string, unknown>;
}

/**
 * Zod schemas for runtime validation
 */
export const MessageTypeSchema = z.nativeEnum(MessageType);
export const MessagePrioritySchema = z.nativeEnum(MessagePriority);

export const BaseMessageSchema = z.object({
  id: z.string().min(1),
  type: MessageTypeSchema,
  priority: MessagePrioritySchema,
  timestamp: z.date(),
  senderId: z.string().min(1),
  receiverId: z.string().optional(),
  correlationId: z.string().optional(),
  ttl: z.number().positive().optional()
});

export const TaskAssignMessageSchema = BaseMessageSchema.extend({
  type: z.literal(MessageType.TASK_ASSIGN),
  payload: z.object({
    taskId: z.string().min(1),
    title: z.string().min(1),
    description: z.string(),
    context: z.record(z.unknown()),
    priority: z.string(),
    timeout: z.number().positive().optional()
  })
});

export const TaskProgressMessageSchema = BaseMessageSchema.extend({
  type: z.literal(MessageType.TASK_PROGRESS),
  payload: z.object({
    taskId: z.string().min(1),
    progress: z.object({
      percentage: z.number().min(0).max(100),
      currentStep: z.string().optional(),
      totalSteps: z.number().positive().optional(),
      completedSteps: z.number().nonnegative().optional(),
      estimatedTimeRemaining: z.number().positive().optional(),
      message: z.string().optional()
    }),
    output: z.string().optional(),
    logs: z.array(z.string()).optional()
  })
});

export const ErrorMessageSchema = BaseMessageSchema.extend({
  type: z.literal(MessageType.ERROR),
  payload: z.object({
    code: z.string().min(1),
    message: z.string().min(1),
    details: z.record(z.unknown()).optional(),
    retryable: z.boolean()
  })
});