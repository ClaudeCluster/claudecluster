export interface Task {
  id: string;
  title: string;
  description: string;
  category: TaskCategory;
  priority: TaskPriority;
  status: TaskStatus;
  assignee?: string;
  estimatedTime: string;
  dependencies: string[];
  createdAt: Date;
  updatedAt: Date;
  progress: number;
  comments: TaskComment[];
  attachments: TaskAttachment[];
  metadata: Record<string, any>;
}

export interface TaskComment {
  id: string;
  author: string;
  content: string;
  timestamp: Date;
}

export interface TaskAttachment {
  id: string;
  name: string;
  type: string;
  size: number;
  url: string;
  uploadedAt: Date;
}

export enum TaskCategory {
  ARCHITECTURE = 'Architecture',
  CORE_DEVELOPMENT = 'Core Development',
  TESTING = 'Testing',
  DOCUMENTATION = 'Documentation',
  DEVOPS = 'DevOps',
  RESEARCH = 'Research'
}

export enum TaskPriority {
  CRITICAL = 'Critical',
  HIGH = 'High',
  MEDIUM = 'Medium',
  LOW = 'Low',
  BACKLOG = 'Backlog'
}

export enum TaskStatus {
  BACKLOG = 'Backlog',
  TODO = 'To Do',
  IN_PROGRESS = 'In Progress',
  REVIEW = 'Review',
  TESTING = 'Testing',
  DONE = 'Done',
  BLOCKED = 'Blocked'
}

export interface Worker {
  id: string;
  name: string;
  status: WorkerStatus;
  capabilities: string[];
  currentTask?: string;
  lastHeartbeat: Date;
  metadata: Record<string, any>;
}

export enum WorkerStatus {
  IDLE = 'idle',
  BUSY = 'busy',
  OFFLINE = 'offline',
  ERROR = 'error'
}

export interface Driver {
  id: string;
  name: string;
  status: DriverStatus;
  workers: string[];
  tasks: string[];
  metadata: Record<string, any>;
}

export enum DriverStatus {
  ACTIVE = 'active',
  INACTIVE = 'inactive',
  ERROR = 'error'
}

export interface TaskResult {
  taskId: string;
  workerId: string;
  status: 'success' | 'failure' | 'partial';
  output: any;
  error?: string;
  duration: number;
  timestamp: Date;
}

export interface OrchestrationConfig {
  maxWorkers: number;
  taskTimeout: number;
  retryAttempts: number;
  heartbeatInterval: number;
  logLevel: string;
}
