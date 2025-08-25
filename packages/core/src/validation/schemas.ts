/**
 * @fileoverview Centralized Zod validation schemas for ClaudeCluster
 */

import { z } from 'zod';

// Re-export all schemas from type files
export {
  TaskStatusSchema,
  TaskPrioritySchema,
  TaskCategorySchema,
  TaskMetricsSchema,
  TaskArtifactSchema,
  TaskContextSchema,
  TaskProgressSchema,
  TaskSchema
} from '../types/task.js';

export {
  WorkerStatusSchema,
  WorkerResourcesSchema,
  WorkerCapabilitiesSchema,
  WorkerHealthSchema,
  WorkerMetricsSchema,
  WorkerConfigSchema,
  WorkerTaskAssignmentSchema,
  WorkerSchema
} from '../types/worker.js';

export {
  DriverStatusSchema,
  ExecutionStrategySchema,
  TaskDependencySchema,
  ExecutionPhaseSchema,
  ExecutionPlanSchema,
  DriverConfigSchema,
  DriverMetricsSchema,
  DriverExecutionStateSchema
} from '../types/driver.js';

export {
  MessageTypeSchema,
  MessagePrioritySchema,
  BaseMessageSchema,
  TaskAssignMessageSchema,
  TaskProgressMessageSchema,
  ErrorMessageSchema
} from '../types/communication.js';

export {
  ErrorCategorySchema,
  ErrorSeveritySchema,
  ErrorInfoSchema
} from '../types/errors.js';

export {
  LogLevelSchema,
  HealthStatusSchema,
  EnvironmentSchema,
  SortDirectionSchema,
  BaseConfigSchema,
  PaginationParamsSchema,
  TimestampsSchema,
  BaseEntitySchema,
  DurationSchema,
  RetryConfigSchema
} from '../types/common.js';

/**
 * Validation utility functions
 */
export class ValidationUtils {
  /**
   * Validate data against a Zod schema with detailed error messages
   */
  static validate<T>(
    schema: z.ZodSchema<T>,
    data: unknown,
    context?: string
  ): { success: true; data: T } | { success: false; errors: string[] } {
    try {
      const result = schema.parse(data);
      return { success: true, data: result };
    } catch (error) {
      if (error instanceof z.ZodError) {
        const errors = error.errors.map(err => {
          const path = err.path.length > 0 ? err.path.join('.') : 'root';
          const contextPrefix = context ? `${context}.` : '';
          return `${contextPrefix}${path}: ${err.message}`;
        });
        return { success: false, errors };
      }
      return { 
        success: false, 
        errors: [`Validation failed: ${error instanceof Error ? error.message : String(error)}`]
      };
    }
  }

  /**
   * Safely parse data with a Zod schema, returning undefined on error
   */
  static safeParse<T>(schema: z.ZodSchema<T>, data: unknown): T | undefined {
    const result = schema.safeParse(data);
    return result.success ? result.data : undefined;
  }

  /**
   * Validate an array of items against a schema
   */
  static validateArray<T>(
    itemSchema: z.ZodSchema<T>,
    data: unknown[],
    context?: string
  ): { success: true; data: T[] } | { success: false; errors: string[] } {
    const arraySchema = z.array(itemSchema);
    return this.validate(arraySchema, data, context);
  }

  /**
   * Create a partial version of a schema (all fields optional)
   */
  static partial<T extends z.ZodRawShape>(schema: z.ZodObject<T>): z.ZodObject<{
    [K in keyof T]: z.ZodOptional<T[K]>;
  }> {
    return schema.partial();
  }

  /**
   * Create a required version of a partial schema
   */
  static required<T extends z.ZodRawShape>(
    schema: z.ZodObject<T>,
    fields: (keyof T)[]
  ): z.ZodObject<T> {
    const shape = schema.shape;
    const requiredShape = { ...shape };
    
    for (const field of fields) {
      if (field in shape) {
        const fieldSchema = shape[field];
        if (fieldSchema instanceof z.ZodOptional) {
          requiredShape[field] = fieldSchema.unwrap();
        }
      }
    }
    
    return z.object(requiredShape);
  }

  /**
   * Merge multiple schemas into one
   */
  static merge<T extends z.ZodRawShape, U extends z.ZodRawShape>(
    schema1: z.ZodObject<T>,
    schema2: z.ZodObject<U>
  ): z.ZodObject<any> {
    return schema1.merge(schema2) as any;
  }

  /**
   * Create a discriminated union schema
   */
  static discriminatedUnion<K extends string, T extends Record<K, any>>(
    discriminator: K,
    options: { [V in T[K]]: z.ZodObject<any> }
  ): z.ZodDiscriminatedUnion<K, any> {
    const optionArray = Object.entries(options).map(([key, schema]) => 
      (schema as any).extend({ [discriminator]: z.literal(key) })
    );
    
    return z.discriminatedUnion(discriminator, optionArray as any);
  }

  /**
   * Validate environment variables with defaults
   */
  static validateEnv<T extends Record<string, z.ZodTypeAny>>(
    schema: z.ZodObject<T>,
    env: Record<string, string | undefined> = process.env
  ): z.infer<z.ZodObject<T>> {
    const result = schema.safeParse(env);
    
    if (!result.success) {
      const errors = result.error.errors.map(err => 
        `Environment variable ${err.path.join('.')}: ${err.message}`
      );
      throw new Error(`Environment validation failed:\n${errors.join('\n')}`);
    }
    
    return result.data;
  }
}

/**
 * Common validation patterns
 */
export const ValidationPatterns = {
  /**
   * UUID v4 pattern
   */
  uuid: z.string().uuid(),

  /**
   * Email pattern
   */
  email: z.string().email(),

  /**
   * URL pattern
   */
  url: z.string().url(),

  /**
   * Semantic version pattern
   */
  semver: z.string().regex(/^\d+\.\d+\.\d+(?:-[\w\-\.]+)?(?:\+[\w\-\.]+)?$/),

  /**
   * ISO 8601 date string
   */
  isoDate: z.string().datetime(),

  /**
   * Positive integer
   */
  positiveInt: z.number().int().positive(),

  /**
   * Non-negative integer
   */
  nonNegativeInt: z.number().int().nonnegative(),

  /**
   * Percentage (0-100)
   */
  percentage: z.number().min(0).max(100),

  /**
   * Port number
   */
  port: z.number().int().min(1).max(65535),

  /**
   * Non-empty string
   */
  nonEmptyString: z.string().min(1),

  /**
   * Trimmed non-empty string
   */
  trimmedString: z.string().trim().min(1),

  /**
   * Base64 encoded string
   */
  base64: z.string().regex(/^[A-Za-z0-9+/]*={0,2}$/),

  /**
   * Hexadecimal string
   */
  hex: z.string().regex(/^[0-9a-fA-F]+$/),

  /**
   * JSON string
   */
  jsonString: z.string().transform((str, ctx) => {
    try {
      return JSON.parse(str);
    } catch (error) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Invalid JSON' });
      return z.NEVER;
    }
  }),

  /**
   * Duration in milliseconds
   */
  durationMs: z.number().int().positive(),

  /**
   * File path (basic validation)
   */
  filePath: z.string().min(1),

  /**
   * Directory path (basic validation)
   */
  dirPath: z.string().min(1),

  /**
   * CRON expression pattern
   */
  cron: z.string().regex(/^(\*|([0-5]?\d)) (\*|([01]?\d|2[0-3])) (\*|([0-2]?\d|3[01])) (\*|([0]?\d|1[0-2])) (\*|[0-6])$/),

  /**
   * IP address (IPv4 or IPv6)
   */
  ipAddress: z.string().ip(),

  /**
   * Domain name
   */
  domain: z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9-]{0,61}[a-zA-Z0-9](?:\.[a-zA-Z0-9][a-zA-Z0-9-]{0,61}[a-zA-Z0-9])*$/),

  /**
   * Slug (URL-friendly string)
   */
  slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),

  /**
   * Safe HTML string (basic sanitization)
   */
  safeHtml: z.string().regex(/^[^<>]*$/),

  /**
   * Color hex code
   */
  colorHex: z.string().regex(/^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/),

  /**
   * Latitude coordinate
   */
  latitude: z.number().min(-90).max(90),

  /**
   * Longitude coordinate
   */
  longitude: z.number().min(-180).max(180)
};