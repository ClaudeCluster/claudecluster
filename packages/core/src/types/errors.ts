/**
 * @fileoverview Error handling types and custom error classes for ClaudeCluster
 */

import { z } from 'zod';

/**
 * Error category enumeration
 */
export enum ErrorCategory {
  TASK_ERROR = 'task_error',
  WORKER_ERROR = 'worker_error',
  DRIVER_ERROR = 'driver_error',
  COMMUNICATION_ERROR = 'communication_error',
  VALIDATION_ERROR = 'validation_error',
  SYSTEM_ERROR = 'system_error',
  TIMEOUT_ERROR = 'timeout_error',
  RESOURCE_ERROR = 'resource_error'
}

/**
 * Error severity levels
 */
export enum ErrorSeverity {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  CRITICAL = 'critical'
}

/**
 * Base error information interface
 */
export interface ErrorInfo {
  readonly code: string;
  readonly message: string;
  readonly category: ErrorCategory;
  readonly severity: ErrorSeverity;
  readonly timestamp: Date;
  readonly context?: Record<string, unknown> | undefined;
  readonly stackTrace?: string | undefined;
  readonly retryable: boolean;
  readonly correlationId?: string | undefined;
}

/**
 * Base ClaudeCluster error class
 */
export abstract class ClaudeClusterError extends Error {
  public readonly code: string;
  public readonly category: ErrorCategory;
  public readonly severity: ErrorSeverity;
  public readonly timestamp: Date;
  public readonly context?: Record<string, unknown> | undefined;
  public readonly retryable: boolean;
  public readonly correlationId?: string | undefined;

  constructor(
    code: string,
    message: string,
    category: ErrorCategory,
    severity: ErrorSeverity,
    retryable: boolean = false,
    context?: Record<string, unknown> | undefined,
    correlationId?: string | undefined
  ) {
    super(message);
    this.name = this.constructor.name;
    this.code = code;
    this.category = category;
    this.severity = severity;
    this.timestamp = new Date();
    this.context = context;
    this.retryable = retryable;
    this.correlationId = correlationId;

    // Ensure stack trace is captured
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }

  /**
   * Convert error to serializable object
   */
  toJSON(): ErrorInfo {
    return {
      code: this.code,
      message: this.message,
      category: this.category,
      severity: this.severity,
      timestamp: this.timestamp,
      context: this.context,
      stackTrace: this.stack,
      retryable: this.retryable,
      correlationId: this.correlationId
    };
  }
}

/**
 * Task-related errors
 */
export class TaskError extends ClaudeClusterError {
  constructor(
    code: string,
    message: string,
    severity: ErrorSeverity = ErrorSeverity.MEDIUM,
    retryable: boolean = true,
    context?: Record<string, unknown>,
    correlationId?: string
  ) {
    super(code, message, ErrorCategory.TASK_ERROR, severity, retryable, context, correlationId);
  }
}

/**
 * Task execution timeout error
 */
export class TaskTimeoutError extends TaskError {
  constructor(
    taskId: string,
    timeoutMs: number,
    correlationId?: string
  ) {
    super(
      'TASK_TIMEOUT',
      `Task ${taskId} timed out after ${timeoutMs}ms`,
      ErrorSeverity.HIGH,
      true,
      { taskId, timeoutMs },
      correlationId
    );
  }
}

/**
 * Task dependency cycle error
 */
export class TaskDependencyCycleError extends TaskError {
  constructor(
    cycle: readonly string[],
    correlationId?: string
  ) {
    super(
      'TASK_DEPENDENCY_CYCLE',
      `Circular dependency detected: ${cycle.join(' -> ')}`,
      ErrorSeverity.HIGH,
      false,
      { cycle },
      correlationId
    );
  }
}

/**
 * Worker-related errors
 */
export class WorkerError extends ClaudeClusterError {
  constructor(
    code: string,
    message: string,
    severity: ErrorSeverity = ErrorSeverity.MEDIUM,
    retryable: boolean = true,
    context?: Record<string, unknown>,
    correlationId?: string
  ) {
    super(code, message, ErrorCategory.WORKER_ERROR, severity, retryable, context, correlationId);
  }
}

/**
 * Worker unavailable error
 */
export class WorkerUnavailableError extends WorkerError {
  constructor(
    workerId: string,
    reason: string,
    correlationId?: string
  ) {
    super(
      'WORKER_UNAVAILABLE',
      `Worker ${workerId} is unavailable: ${reason}`,
      ErrorSeverity.HIGH,
      true,
      { workerId, reason },
      correlationId
    );
  }
}

/**
 * Worker capacity exceeded error
 */
export class WorkerCapacityExceededError extends WorkerError {
  constructor(
    workerId: string,
    currentTasks: number,
    maxTasks: number,
    correlationId?: string
  ) {
    super(
      'WORKER_CAPACITY_EXCEEDED',
      `Worker ${workerId} capacity exceeded: ${currentTasks}/${maxTasks} tasks`,
      ErrorSeverity.MEDIUM,
      true,
      { workerId, currentTasks, maxTasks },
      correlationId
    );
  }
}

/**
 * Driver-related errors
 */
export class DriverError extends ClaudeClusterError {
  constructor(
    code: string,
    message: string,
    severity: ErrorSeverity = ErrorSeverity.HIGH,
    retryable: boolean = false,
    context?: Record<string, unknown>,
    correlationId?: string
  ) {
    super(code, message, ErrorCategory.DRIVER_ERROR, severity, retryable, context, correlationId);
  }
}

/**
 * Driver initialization error
 */
export class DriverInitializationError extends DriverError {
  constructor(
    reason: string,
    correlationId?: string
  ) {
    super(
      'DRIVER_INITIALIZATION_FAILED',
      `Driver initialization failed: ${reason}`,
      ErrorSeverity.CRITICAL,
      false,
      { reason },
      correlationId
    );
  }
}

/**
 * Communication-related errors
 */
export class CommunicationError extends ClaudeClusterError {
  constructor(
    code: string,
    message: string,
    severity: ErrorSeverity = ErrorSeverity.MEDIUM,
    retryable: boolean = true,
    context?: Record<string, unknown>,
    correlationId?: string
  ) {
    super(code, message, ErrorCategory.COMMUNICATION_ERROR, severity, retryable, context, correlationId);
  }
}

/**
 * Connection timeout error
 */
export class ConnectionTimeoutError extends CommunicationError {
  constructor(
    endpoint: string,
    timeoutMs: number,
    correlationId?: string
  ) {
    super(
      'CONNECTION_TIMEOUT',
      `Connection to ${endpoint} timed out after ${timeoutMs}ms`,
      ErrorSeverity.HIGH,
      true,
      { endpoint, timeoutMs },
      correlationId
    );
  }
}

/**
 * Message delivery failed error
 */
export class MessageDeliveryFailedError extends CommunicationError {
  constructor(
    messageId: string,
    recipient: string,
    reason: string,
    correlationId?: string
  ) {
    super(
      'MESSAGE_DELIVERY_FAILED',
      `Failed to deliver message ${messageId} to ${recipient}: ${reason}`,
      ErrorSeverity.MEDIUM,
      true,
      { messageId, recipient, reason },
      correlationId
    );
  }
}

/**
 * Validation-related errors
 */
export class ValidationError extends ClaudeClusterError {
  constructor(
    field: string,
    value: unknown,
    constraint: string,
    correlationId?: string
  ) {
    super(
      'VALIDATION_ERROR',
      `Validation failed for field '${field}': ${constraint}`,
      ErrorCategory.VALIDATION_ERROR,
      ErrorSeverity.LOW,
      false,
      { field, value, constraint },
      correlationId
    );
  }
}

/**
 * Resource-related errors
 */
export class ResourceError extends ClaudeClusterError {
  constructor(
    code: string,
    message: string,
    severity: ErrorSeverity = ErrorSeverity.HIGH,
    retryable: boolean = true,
    context?: Record<string, unknown>,
    correlationId?: string
  ) {
    super(code, message, ErrorCategory.RESOURCE_ERROR, severity, retryable, context, correlationId);
  }
}

/**
 * Insufficient resources error
 */
export class InsufficientResourcesError extends ResourceError {
  constructor(
    resourceType: string,
    required: number,
    available: number,
    correlationId?: string
  ) {
    super(
      'INSUFFICIENT_RESOURCES',
      `Insufficient ${resourceType}: required ${required}, available ${available}`,
      ErrorSeverity.HIGH,
      true,
      { resourceType, required, available },
      correlationId
    );
  }
}

/**
 * System-related errors
 */
export class SystemError extends ClaudeClusterError {
  constructor(
    code: string,
    message: string,
    severity: ErrorSeverity = ErrorSeverity.CRITICAL,
    retryable: boolean = false,
    context?: Record<string, unknown>,
    correlationId?: string
  ) {
    super(code, message, ErrorCategory.SYSTEM_ERROR, severity, retryable, context, correlationId);
  }
}

/**
 * Zod schemas for error validation
 */
export const ErrorCategorySchema = z.nativeEnum(ErrorCategory);
export const ErrorSeveritySchema = z.nativeEnum(ErrorSeverity);

export const ErrorInfoSchema = z.object({
  code: z.string().min(1),
  message: z.string().min(1),
  category: ErrorCategorySchema,
  severity: ErrorSeveritySchema,
  timestamp: z.date(),
  context: z.record(z.unknown()).optional(),
  stackTrace: z.string().optional(),
  retryable: z.boolean(),
  correlationId: z.string().optional()
});

/**
 * Error factory for creating typed errors
 */
export class ErrorFactory {
  static createTaskError(
    code: string,
    message: string,
    context?: Record<string, unknown>,
    correlationId?: string
  ): TaskError {
    return new TaskError(code, message, ErrorSeverity.MEDIUM, true, context, correlationId);
  }

  static createWorkerError(
    code: string,
    message: string,
    context?: Record<string, unknown>,
    correlationId?: string
  ): WorkerError {
    return new WorkerError(code, message, ErrorSeverity.MEDIUM, true, context, correlationId);
  }

  static createDriverError(
    code: string,
    message: string,
    context?: Record<string, unknown>,
    correlationId?: string
  ): DriverError {
    return new DriverError(code, message, ErrorSeverity.HIGH, false, context, correlationId);
  }

  static createCommunicationError(
    code: string,
    message: string,
    context?: Record<string, unknown>,
    correlationId?: string
  ): CommunicationError {
    return new CommunicationError(code, message, ErrorSeverity.MEDIUM, true, context, correlationId);
  }

  static createValidationError(
    field: string,
    value: unknown,
    constraint: string,
    correlationId?: string
  ): ValidationError {
    return new ValidationError(field, value, constraint, correlationId);
  }
}