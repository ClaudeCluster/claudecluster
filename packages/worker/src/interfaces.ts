// Core interfaces for PTY and SSE integration

import { TaskSubmissionRequest, TaskSubmissionResponse } from './schemas';

/**
 * Interface for task execution strategies
 * Allows pluggable execution backends (stub, PTY, etc.)
 */
export interface ITaskExecutor {
  execute(taskId: string, request: TaskSubmissionRequest): Promise<TaskResult>;
  getStatus(taskId: string): TaskExecutionStatus | undefined;
  cancel(taskId: string): Promise<boolean>;
  cleanup(): Promise<void>;
}

/**
 * Interface for streaming capabilities
 * Prepares for SSE integration
 */
export interface IStreamingService {
  createStream(taskId: string): Promise<StreamHandler>;
  closeStream(taskId: string): Promise<void>;
  broadcastEvent(taskId: string, event: StreamEvent): Promise<void>;
  getActiveStreams(): string[];
}

/**
 * Interface for terminal/process management
 * Prepares for PTY integration
 */
export interface IProcessManager {
  spawn(command: string, args: string[], options?: SpawnOptions): Promise<ProcessHandle>;
  kill(processId: string): Promise<boolean>;
  getActiveProcesses(): ProcessHandle[];
  cleanup(): Promise<void>;
}

// Supporting types for the interfaces

export interface TaskResult {
  taskId: string;
  status: 'completed' | 'failed' | 'cancelled';
  output?: string;
  error?: string;
  exitCode?: number;
  duration: number;
}

export interface TaskExecutionStatus {
  taskId: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
  startTime?: Date;
  endTime?: Date;
  progress?: number;
}

export interface StreamHandler {
  taskId: string;
  write(event: StreamEvent): Promise<void>;
  close(): Promise<void>;
  isClosed(): boolean;
}

export interface StreamEvent {
  type: 'output' | 'error' | 'status' | 'complete';
  data: any;
  timestamp: Date;
}

export interface ProcessHandle {
  id: string;
  pid?: number;
  command: string;
  args: string[];
  status: 'running' | 'completed' | 'failed' | 'killed';
  createdAt: Date;
}

export interface SpawnOptions {
  cwd?: string;
  env?: Record<string, string>;
  timeout?: number;
}

// Event types for future SSE implementation
export enum StreamEventType {
  OUTPUT = 'output',
  ERROR = 'error',
  STATUS = 'status',
  COMPLETE = 'complete',
  PROGRESS = 'progress'
}