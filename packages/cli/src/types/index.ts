/**
 * @fileoverview CLI types and interfaces
 */

import type { Task, TaskResult, Worker, DriverStatus } from '@claudecluster/core';

/**
 * CLI configuration
 */
export interface CLIConfig {
  defaultDriverUrl: string;
  defaultMCPUrl: string;
  defaultOutputFormat: OutputFormat;
  defaultTimeout: number;
  enableColors: boolean;
  enableProgressBars: boolean;
  configFile?: string;
}

/**
 * Output format options
 */
export type OutputFormat = 'json' | 'yaml' | 'table' | 'text';

/**
 * Command context
 */
export interface CommandContext {
  readonly config: CLIConfig;
  readonly driverUrl: string;
  readonly mcpUrl: string;
  readonly outputFormat: OutputFormat;
  readonly verbose: boolean;
  readonly quiet: boolean;
}

/**
 * Task submission options
 */
export interface TaskSubmissionOptions {
  readonly title: string;
  readonly description: string;
  readonly category?: string;
  readonly priority?: string;
  readonly dependencies?: string[];
  readonly context?: Record<string, unknown>;
  readonly file?: string;
  readonly interactive?: boolean;
  readonly watch?: boolean;
  readonly timeout?: number;
}

/**
 * Task query options
 */
export interface TaskQueryOptions {
  readonly taskId?: string;
  readonly status?: string;
  readonly category?: string;
  readonly priority?: string;
  readonly limit?: number;
  readonly offset?: number;
  readonly sortBy?: 'createdAt' | 'updatedAt' | 'priority' | 'status';
  readonly sortOrder?: 'asc' | 'desc';
}

/**
 * Cluster management options
 */
export interface ClusterOptions {
  readonly action: 'start' | 'stop' | 'restart' | 'status';
  readonly workers?: number;
  readonly driverConfig?: Record<string, unknown>;
  readonly workerConfig?: Record<string, unknown>;
  readonly mcpConfig?: Record<string, unknown>;
}

/**
 * Export options
 */
export interface ExportOptions {
  readonly format: OutputFormat;
  readonly output?: string;
  readonly includeResults?: boolean;
  readonly includeContext?: boolean;
  readonly dateRange?: {
    from: Date;
    to: Date;
  };
}

/**
 * CLI command result
 */
export interface CommandResult<T = any> {
  readonly success: boolean;
  readonly data?: T;
  readonly error?: string;
  readonly warnings?: string[];
  readonly metadata?: Record<string, unknown>;
}

/**
 * Progress callback
 */
export type ProgressCallback = (progress: {
  readonly current: number;
  readonly total: number;
  readonly message?: string;
  readonly details?: Record<string, unknown>;
}) => void;

/**
 * WebSocket event types
 */
export interface WebSocketEvents {
  'task-progress': (taskId: string, progress: number, total?: number) => void;
  'task-completed': (taskId: string, result: TaskResult) => void;
  'task-failed': (taskId: string, error: string) => void;
  'worker-status': (workerId: string, status: string) => void;
  'cluster-status': (status: DriverStatus) => void;
  'error': (error: Error) => void;
  'connected': () => void;
  'disconnected': () => void;
}

/**
 * Interactive prompt types
 */
export interface PromptQuestion {
  readonly type: 'input' | 'select' | 'multiselect' | 'confirm' | 'password';
  readonly name: string;
  readonly message: string;
  readonly default?: any;
  readonly choices?: Array<{ name: string; value: any }>;
  readonly validate?: (input: any) => boolean | string;
  readonly when?: (answers: any) => boolean;
}

/**
 * Configuration validation result
 */
export interface ConfigValidation {
  readonly valid: boolean;
  readonly errors: string[];
  readonly warnings: string[];
}

/**
 * CLI statistics
 */
export interface CLIStats {
  readonly totalCommands: number;
  readonly successfulCommands: number;
  readonly failedCommands: number;
  readonly averageExecutionTime: number;
  readonly lastUsed: Date;
  readonly mostUsedCommand: string;
}