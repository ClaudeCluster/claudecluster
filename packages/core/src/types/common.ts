/**
 * @fileoverview Common utility types for ClaudeCluster
 */

import { z } from 'zod';

/**
 * Generic result type for operations that can succeed or fail
 */
export type Result<T, E = Error> = 
  | { success: true; data: T; error?: never }
  | { success: false; error: E; data?: never };

/**
 * Async result type
 */
export type AsyncResult<T, E = Error> = Promise<Result<T, E>>;

/**
 * Optional type utility
 */
export type Optional<T, K extends keyof T> = Omit<T, K> & Partial<Pick<T, K>>;

/**
 * Deep partial type utility
 */
export type DeepPartial<T> = {
  [P in keyof T]?: T[P] extends object ? DeepPartial<T[P]> : T[P];
};

/**
 * Read-only deep type utility
 */
export type DeepReadonly<T> = {
  readonly [P in keyof T]: T[P] extends object ? DeepReadonly<T[P]> : T[P];
};

/**
 * Non-empty array type
 */
export type NonEmptyArray<T> = [T, ...T[]];

/**
 * String literal union for environment types
 */
export type Environment = 'development' | 'staging' | 'production' | 'test';

/**
 * Log level enumeration
 */
export enum LogLevel {
  TRACE = 'trace',
  DEBUG = 'debug',
  INFO = 'info',
  WARN = 'warn',
  ERROR = 'error',
  FATAL = 'fatal'
}

/**
 * Health status enumeration
 */
export enum HealthStatus {
  HEALTHY = 'healthy',
  DEGRADED = 'degraded',
  UNHEALTHY = 'unhealthy',
  UNKNOWN = 'unknown'
}

/**
 * Generic configuration interface
 */
export interface BaseConfig {
  readonly environment: Environment;
  readonly logLevel: LogLevel;
  readonly version: string;
  readonly nodeEnv?: string;
}

/**
 * Pagination parameters
 */
export interface PaginationParams {
  readonly page?: number;
  readonly limit?: number;
  readonly offset?: number;
}

/**
 * Paginated response wrapper
 */
export interface PaginatedResponse<T> {
  readonly data: readonly T[];
  readonly pagination: {
    readonly page: number;
    readonly limit: number;
    readonly total: number;
    readonly totalPages: number;
    readonly hasNext: boolean;
    readonly hasPrev: boolean;
  };
}

/**
 * Sort direction
 */
export type SortDirection = 'asc' | 'desc';

/**
 * Generic sort parameters
 */
export interface SortParams<T> {
  readonly field: keyof T;
  readonly direction: SortDirection;
}

/**
 * Filter operator types
 */
export type FilterOperator = 
  | 'eq'    // equals
  | 'ne'    // not equals
  | 'gt'    // greater than
  | 'gte'   // greater than or equal
  | 'lt'    // less than
  | 'lte'   // less than or equal
  | 'in'    // in array
  | 'nin'   // not in array
  | 'like'  // string contains
  | 'regex' // regex match
  | 'exists'; // field exists

/**
 * Filter condition
 */
export interface FilterCondition<T = unknown> {
  readonly field: string;
  readonly operator: FilterOperator;
  readonly value: T;
}

/**
 * Compound filter with logical operators
 */
export interface Filter {
  readonly and?: readonly Filter[];
  readonly or?: readonly Filter[];
  readonly conditions?: readonly FilterCondition[];
}

/**
 * Generic query parameters
 */
export interface QueryParams<T> {
  readonly filter?: Filter;
  readonly sort?: readonly SortParams<T>[];
  readonly pagination?: PaginationParams;
  readonly include?: readonly (keyof T)[];
  readonly exclude?: readonly (keyof T)[];
}

/**
 * Timestamp mixin interface
 */
export interface Timestamps {
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

/**
 * Soft delete mixin interface
 */
export interface SoftDelete {
  readonly deletedAt?: Date;
  readonly isDeleted: boolean;
}

/**
 * Versioning mixin interface
 */
export interface Versioned {
  readonly version: number;
  readonly updatedBy?: string;
}

/**
 * Metadata mixin interface
 */
export interface WithMetadata {
  readonly metadata?: Record<string, unknown>;
}

/**
 * Tags mixin interface
 */
export interface Tagged {
  readonly tags?: readonly string[];
}

/**
 * Base entity interface combining common mixins
 */
export interface BaseEntity extends Timestamps, WithMetadata, Tagged {
  readonly id: string;
}

/**
 * ID type for strong typing
 */
export type ID<T = string> = T & { readonly __brand: unique symbol };

/**
 * Create a branded ID type
 */
export function createId<T extends string = string>(value: T): ID<T> {
  return value as ID<T>;
}

/**
 * Duration in different units
 */
export interface Duration {
  readonly milliseconds?: number;
  readonly seconds?: number;
  readonly minutes?: number;
  readonly hours?: number;
  readonly days?: number;
}

/**
 * Convert duration to milliseconds
 */
export function durationToMs(duration: Duration): number {
  const {
    milliseconds = 0,
    seconds = 0,
    minutes = 0,
    hours = 0,
    days = 0
  } = duration;

  return (
    milliseconds +
    seconds * 1000 +
    minutes * 60 * 1000 +
    hours * 60 * 60 * 1000 +
    days * 24 * 60 * 60 * 1000
  );
}

/**
 * Retry configuration
 */
export interface RetryConfig {
  readonly attempts: number;
  readonly delay: Duration;
  readonly backoff: 'exponential' | 'linear' | 'fixed';
  readonly maxDelay?: Duration;
  readonly jitter?: boolean;
}

/**
 * Timeout configuration
 */
export interface TimeoutConfig {
  readonly duration: Duration;
  readonly message?: string;
}

/**
 * Circuit breaker states
 */
export enum CircuitBreakerState {
  CLOSED = 'closed',
  OPEN = 'open',
  HALF_OPEN = 'half_open'
}

/**
 * Circuit breaker configuration
 */
export interface CircuitBreakerConfig {
  readonly failureThreshold: number;
  readonly recoveryTimeout: Duration;
  readonly monitoringWindow: Duration;
  readonly minimumThroughput: number;
}

/**
 * Rate limiting configuration
 */
export interface RateLimitConfig {
  readonly maxRequests: number;
  readonly window: Duration;
  readonly burstSize?: number;
}

/**
 * Zod schemas for common types
 */
export const LogLevelSchema = z.nativeEnum(LogLevel);
export const HealthStatusSchema = z.nativeEnum(HealthStatus);
export const EnvironmentSchema = z.enum(['development', 'staging', 'production', 'test']);
export const SortDirectionSchema = z.enum(['asc', 'desc']);

export const BaseConfigSchema = z.object({
  environment: EnvironmentSchema,
  logLevel: LogLevelSchema,
  version: z.string().min(1),
  nodeEnv: z.string().optional()
});

export const PaginationParamsSchema = z.object({
  page: z.number().positive().optional(),
  limit: z.number().positive().max(1000).optional(),
  offset: z.number().nonnegative().optional()
});

export const TimestampsSchema = z.object({
  createdAt: z.date(),
  updatedAt: z.date()
});

export const BaseEntitySchema = TimestampsSchema.extend({
  id: z.string().min(1),
  metadata: z.record(z.unknown()).optional(),
  tags: z.array(z.string()).optional()
});

export const DurationSchema = z.object({
  milliseconds: z.number().nonnegative().optional(),
  seconds: z.number().nonnegative().optional(),
  minutes: z.number().nonnegative().optional(),
  hours: z.number().nonnegative().optional(),
  days: z.number().nonnegative().optional()
});

export const RetryConfigSchema = z.object({
  attempts: z.number().positive(),
  delay: DurationSchema,
  backoff: z.enum(['exponential', 'linear', 'fixed']),
  maxDelay: DurationSchema.optional(),
  jitter: z.boolean().optional()
});

/**
 * Utility function to create a Result success
 */
export function success<T>(data: T): Result<T, never> {
  return { success: true, data };
}

/**
 * Utility function to create a Result error
 */
export function failure<E>(error: E): Result<never, E> {
  return { success: false, error };
}

/**
 * Type guard for Result success
 */
export function isSuccess<T, E>(result: Result<T, E>): result is { success: true; data: T } {
  return result.success;
}

/**
 * Type guard for Result failure
 */
export function isFailure<T, E>(result: Result<T, E>): result is { success: false; error: E } {
  return !result.success;
}