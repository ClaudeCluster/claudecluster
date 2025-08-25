/**
 * @fileoverview Structured logging framework using Pino for ClaudeCluster
 */

import pino from 'pino';
import type { Logger as PinoLogger, LoggerOptions } from 'pino';
import { LogLevel } from '@claudecluster/core';

/**
 * Environment enumeration (local definition)
 */
export enum Environment {
  DEVELOPMENT = 'development',
  STAGING = 'staging',
  PRODUCTION = 'production',
  TEST = 'test'
}

/**
 * Log context interface for structured logging
 */
export interface LogContext {
  readonly component?: string;
  readonly operation?: string;
  readonly requestId?: string;
  readonly correlationId?: string;
  readonly userId?: string;
  readonly taskId?: string;
  readonly workerId?: string;
  readonly driverId?: string;
  readonly sessionId?: string;
  readonly duration?: number;
  readonly [key: string]: unknown;
}

/**
 * Logger configuration options
 */
export interface LoggerConfig {
  readonly level: LogLevel;
  readonly environment: Environment;
  readonly serviceName: string;
  readonly serviceVersion: string;
  readonly prettyPrint?: boolean;
  readonly enableRedaction?: boolean;
  readonly redactPaths?: string[];
  readonly destination?: string; // File path or 'stdout'
  readonly enableMetrics?: boolean;
}

/**
 * Performance timing helper
 */
export class Timer {
  private startTime: number;
  private endTime?: number;

  constructor() {
    this.startTime = Date.now();
  }

  /**
   * Stop the timer and return duration in milliseconds
   */
  stop(): number {
    this.endTime = Date.now();
    return this.duration();
  }

  /**
   * Get current or final duration in milliseconds
   */
  duration(): number {
    const end = this.endTime || Date.now();
    return end - this.startTime;
  }

  /**
   * Get duration in a human-readable format
   */
  humanDuration(): string {
    const ms = this.duration();
    if (ms < 1000) return `${ms}ms`;
    if (ms < 60000) return `${(ms / 1000).toFixed(2)}s`;
    if (ms < 3600000) return `${(ms / 60000).toFixed(2)}m`;
    return `${(ms / 3600000).toFixed(2)}h`;
  }
}

/**
 * Enhanced logger class with ClaudeCluster-specific features
 */
export class Logger {
  private pino: PinoLogger;
  private baseContext: LogContext;
  private config: LoggerConfig;

  constructor(config: LoggerConfig, baseContext: LogContext = {}) {
    this.config = config;
    this.baseContext = baseContext;
    this.pino = this.createPinoLogger(config);
  }

  /**
   * Create and configure Pino logger instance
   */
  private createPinoLogger(config: LoggerConfig): PinoLogger {
    const options: LoggerOptions = {
      name: config.serviceName,
      level: config.level,
      base: {
        service: config.serviceName,
        version: config.serviceVersion,
        environment: config.environment,
        pid: process.pid,
        hostname: process.env.HOSTNAME || require('os').hostname()
      },
      timestamp: pino.stdTimeFunctions.isoTime,
      formatters: {
        level: (label) => ({ level: label }),
        bindings: (bindings) => ({
          pid: bindings.pid,
          hostname: bindings.hostname
        })
      }
    };

    // Configure redaction for sensitive data
    if (config.enableRedaction && config.redactPaths) {
      options.redact = {
        paths: [
          'password',
          'token',
          'apiKey',
          'secret',
          'authorization',
          'cookie',
          ...config.redactPaths
        ],
        censor: '[REDACTED]'
      };
    }

    // Configure destination
    const destination = config.destination === 'stdout' || !config.destination
      ? process.stdout
      : pino.destination({
          dest: config.destination,
          sync: false,
          mkdir: true
        });

    // Configure pretty printing for development
    if (config.prettyPrint && config.environment === Environment.DEVELOPMENT) {
      const pinoPretty = require('pino-pretty');
      return pino(options, pinoPretty({
        colorize: true,
        translateTime: 'SYS:standard',
        ignore: 'pid,hostname',
        messageFormat: '{component} {operation} - {msg}',
        errorProps: 'stack,cause'
      }));
    }

    return pino(options, destination);
  }

  /**
   * Create a child logger with additional context
   */
  child(context: LogContext): Logger {
    const mergedContext = { ...this.baseContext, ...context };
    const childLogger = new Logger(this.config, mergedContext);
    childLogger.pino = this.pino.child(mergedContext);
    return childLogger;
  }

  /**
   * Start a performance timer
   */
  timer(): Timer {
    return new Timer();
  }

  /**
   * Trace level logging
   */
  trace(message: string, context?: LogContext): void;
  trace(error: Error, message: string, context?: LogContext): void;
  trace(messageOrError: string | Error, messageOrContext?: string | LogContext, context?: LogContext): void {
    this.log(LogLevel.TRACE, messageOrError, messageOrContext, context);
  }

  /**
   * Debug level logging
   */
  debug(message: string, context?: LogContext): void;
  debug(error: Error, message: string, context?: LogContext): void;
  debug(messageOrError: string | Error, messageOrContext?: string | LogContext, context?: LogContext): void {
    this.log(LogLevel.DEBUG, messageOrError, messageOrContext, context);
  }

  /**
   * Info level logging
   */
  info(message: string, context?: LogContext): void;
  info(error: Error, message: string, context?: LogContext): void;
  info(messageOrError: string | Error, messageOrContext?: string | LogContext, context?: LogContext): void {
    this.log(LogLevel.INFO, messageOrError, messageOrContext, context);
  }

  /**
   * Warn level logging
   */
  warn(message: string, context?: LogContext): void;
  warn(error: Error, message: string, context?: LogContext): void;
  warn(messageOrError: string | Error, messageOrContext?: string | LogContext, context?: LogContext): void {
    this.log(LogLevel.WARN, messageOrError, messageOrContext, context);
  }

  /**
   * Error level logging
   */
  error(message: string, context?: LogContext): void;
  error(error: Error, message?: string, context?: LogContext): void;
  error(messageOrError: string | Error, messageOrContext?: string | LogContext, context?: LogContext): void {
    this.log(LogLevel.ERROR, messageOrError, messageOrContext, context);
  }

  /**
   * Fatal level logging
   */
  fatal(message: string, context?: LogContext): void;
  fatal(error: Error, message?: string, context?: LogContext): void;
  fatal(messageOrError: string | Error, messageOrContext?: string | LogContext, context?: LogContext): void {
    this.log(LogLevel.FATAL, messageOrError, messageOrContext, context);
  }

  /**
   * Generic log method
   */
  private log(
    level: LogLevel,
    messageOrError: string | Error,
    messageOrContext?: string | LogContext,
    context?: LogContext
  ): void {
    let logContext: LogContext = { ...this.baseContext };
    let message: string;
    let error: Error | undefined;

    if (messageOrError instanceof Error) {
      error = messageOrError;
      message = typeof messageOrContext === 'string' ? messageOrContext : error.message;
      if (typeof messageOrContext === 'object') {
        logContext = { ...logContext, ...messageOrContext };
      }
      if (context) {
        logContext = { ...logContext, ...context };
      }
    } else {
      message = messageOrError;
      if (typeof messageOrContext === 'object') {
        logContext = { ...logContext, ...messageOrContext };
      }
      if (context) {
        logContext = { ...logContext, ...context };
      }
    }

    // Add error details to context
    if (error) {
      (logContext as any).error = {
        name: error.name,
        message: error.message,
        stack: error.stack,
        ...(error.cause ? { cause: error.cause } : {})
      };
    }

    this.pino[level](logContext, message);
  }

  /**
   * Log a timed operation
   */
  timeOperation<T>(
    operation: string,
    fn: () => Promise<T>,
    context?: LogContext
  ): Promise<T> {
    const timer = this.timer();
    const operationContext = { ...context, operation };
    
    this.debug(`Starting ${operation}`, operationContext);
    
    return fn()
      .then((result) => {
        const duration = timer.stop();
        this.info(`Completed ${operation}`, {
          ...operationContext,
          duration,
          success: true
        });
        return result;
      })
      .catch((error) => {
        const duration = timer.stop();
        this.error(error, `Failed ${operation}`, {
          ...operationContext,
          duration,
          success: false
        });
        throw error;
      });
  }

  /**
   * Log HTTP request/response
   */
  logHttpRequest(
    method: string,
    url: string,
    statusCode: number,
    duration: number,
    context?: LogContext
  ): void {
    const level = statusCode >= 500 ? LogLevel.ERROR : statusCode >= 400 ? LogLevel.WARN : LogLevel.INFO;
    
    this.log(level, `${method} ${url} ${statusCode}`, {
      ...context,
      http: {
        method,
        url,
        statusCode,
        duration
      }
    });
  }

  /**
   * Log task execution
   */
  logTaskExecution(
    taskId: string,
    status: 'started' | 'completed' | 'failed',
    duration?: number,
    context?: LogContext
  ): void {
    const level = status === 'failed' ? LogLevel.ERROR : LogLevel.INFO;
    
    this.log(level, `Task ${status}`, {
      ...context,
      taskId,
      taskStatus: status,
      ...(duration && { duration })
    });
  }

  /**
   * Log worker event
   */
  logWorkerEvent(
    workerId: string,
    event: string,
    context?: LogContext
  ): void {
    this.info(`Worker ${event}`, {
      ...context,
      workerId,
      workerEvent: event
    });
  }

  /**
   * Flush all pending log entries (useful before process exit)
   */
  flush(): Promise<void> {
    return new Promise((resolve) => {
      this.pino.flush(() => resolve());
    });
  }
}

/**
 * Logger factory for creating service-specific loggers
 */
export class LoggerFactory {
  private static loggers = new Map<string, Logger>();

  /**
   * Create or get a logger for a specific service
   */
  static createLogger(
    serviceName: string,
    config: Omit<LoggerConfig, 'serviceName'>,
    baseContext?: LogContext
  ): Logger {
    const key = `${serviceName}-${JSON.stringify(config)}`;
    
    if (!this.loggers.has(key)) {
      const logger = new Logger(
        { ...config, serviceName },
        baseContext
      );
      this.loggers.set(key, logger);
    }

    return this.loggers.get(key)!;
  }

  /**
   * Create worker logger
   */
  static createWorkerLogger(
    workerId: string,
    config: Omit<LoggerConfig, 'serviceName'>
  ): Logger {
    return this.createLogger(`claudecluster-worker`, config, {
      component: 'worker',
      workerId
    });
  }

  /**
   * Create driver logger
   */
  static createDriverLogger(
    driverId: string,
    config: Omit<LoggerConfig, 'serviceName'>
  ): Logger {
    return this.createLogger(`claudecluster-driver`, config, {
      component: 'driver',
      driverId
    });
  }

  /**
   * Create MCP server logger
   */
  static createMcpLogger(
    mcpId: string,
    config: Omit<LoggerConfig, 'serviceName'>
  ): Logger {
    return this.createLogger(`claudecluster-mcp`, config, {
      component: 'mcp',
      mcpId
    });
  }

  /**
   * Clear all cached loggers
   */
  static clearCache(): void {
    this.loggers.clear();
  }
}

/**
 * Default logger configuration
 */
export const defaultLoggerConfig: Omit<LoggerConfig, 'serviceName'> = {
  level: LogLevel.INFO,
  environment: Environment.DEVELOPMENT,
  serviceVersion: '0.1.0',
  prettyPrint: true,
  enableRedaction: true,
  enableMetrics: false
};