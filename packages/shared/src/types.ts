/**
 * Core TypeScript interfaces for ClaudeCluster system
 * Defines the fundamental data structures used across all packages
 */

// Task-related types
export interface Task {
  id: string;
  prompt: string;
  workerId?: string;
  status: TaskStatus;
  createdAt: Date;
  startedAt?: Date;
  completedAt?: Date;
  result?: TaskResult;
  metadata?: Record<string, unknown>;
}

export type TaskStatus = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';

export interface TaskResult {
  success: boolean;
  output: string;
  error?: string;
  exitCode?: number;
  duration?: number;
}

// Worker-related types
export interface Worker {
  id: string;
  endpoint: string;
  status: WorkerStatus;
  lastHeartbeat?: Date;
  currentTask?: string;
  capabilities: WorkerCapabilities;
  metadata?: Record<string, unknown>;
}

export type WorkerStatus = 'available' | 'busy' | 'offline' | 'error';

export interface WorkerCapabilities {
  maxConcurrentTasks: number;
  supportedCommands: string[];
  environment: WorkerEnvironment;
}

export interface WorkerEnvironment {
  type: 'local' | 'docker' | 'cloud-run';
  version?: string;
  resources?: {
    cpu?: string;
    memory?: string;
  };
}

// Server-Sent Events types
export interface SSEEvent {
  type: SSEEventType;
  data: unknown;
  timestamp: Date;
  taskId?: string;
  workerId?: string;
}

export type SSEEventType = 
  | 'task-started'
  | 'task-progress' 
  | 'task-completed'
  | 'task-failed'
  | 'worker-connected'
  | 'worker-disconnected'
  | 'heartbeat'
  | 'error';

export interface TaskStartedEvent extends SSEEvent {
  type: 'task-started';
  data: {
    taskId: string;
    workerId: string;
    prompt: string;
  };
}

export interface TaskProgressEvent extends SSEEvent {
  type: 'task-progress';
  data: {
    taskId: string;
    chunk: string;
  };
}

export interface TaskCompletedEvent extends SSEEvent {
  type: 'task-completed';
  data: {
    taskId: string;
    result: TaskResult;
  };
}

export interface TaskFailedEvent extends SSEEvent {
  type: 'task-failed';
  data: {
    taskId: string;
    error: string;
    exitCode?: number;
  };
}

// Configuration types
export interface ClaudeClusterConfig {
  server: ServerConfig;
  workers: WorkerConfig[];
  logging: LoggingConfig;
  monitoring: MonitoringConfig;
}

export interface ServerConfig {
  host: string;
  port: number;
  cors: {
    origin: string | string[];
    credentials: boolean;
  };
  rateLimit: {
    windowMs: number;
    maxRequests: number;
  };
}

export interface WorkerConfig {
  id: string;
  endpoint: string;
  type: WorkerEnvironment['type'];
  config?: Record<string, unknown>;
}

export interface LoggingConfig {
  level: 'error' | 'warn' | 'info' | 'debug';
  file?: string;
  console: boolean;
}

export interface MonitoringConfig {
  enabled: boolean;
  heartbeatInterval: number;
  taskTimeout: number;
  retryAttempts: number;
}

// API Request/Response types
export interface TaskSubmissionRequest {
  prompt: string;
  workerId?: string;
  priority?: number;
  metadata?: Record<string, unknown>;
}

export interface TaskSubmissionResponse {
  taskId: string;
  status: TaskStatus;
  estimatedDuration?: number;
}

export interface WorkerHealthResponse {
  status: WorkerStatus;
  uptime: number;
  currentTasks: number;
  capabilities: WorkerCapabilities;
}

// Error types
export class ClaudeClusterError extends Error {
  constructor(
    message: string,
    public code: string,
    public statusCode: number = 500,
    public metadata?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'ClaudeClusterError';
  }
}

export class TaskError extends ClaudeClusterError {
  constructor(message: string, public taskId: string, metadata?: Record<string, unknown>) {
    super(message, 'TASK_ERROR', 422, { taskId, ...metadata });
    this.name = 'TaskError';
  }
}

export class WorkerError extends ClaudeClusterError {
  constructor(message: string, public workerId: string, metadata?: Record<string, unknown>) {
    super(message, 'WORKER_ERROR', 503, { workerId, ...metadata });
    this.name = 'WorkerError';
  }
}

export class ValidationError extends ClaudeClusterError {
  constructor(message: string, public field: string, metadata?: Record<string, unknown>) {
    super(message, 'VALIDATION_ERROR', 400, { field, ...metadata });
    this.name = 'ValidationError';
  }
}