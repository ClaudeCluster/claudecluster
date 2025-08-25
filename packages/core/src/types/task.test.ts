/**
 * @fileoverview Tests for task types and validation
 */

import { describe, expect, test } from '@jest/globals';
import {
  TaskStatus,
  TaskPriority,
  TaskCategory,
  TaskSchema,
  CreateTaskInput,
  Task,
  ExecutionMode,
  SessionOptions,
  SessionOptionsSchema,
  Session,
  SessionSchema,
  CreateSessionTaskInput,
  CreateSessionTaskInputSchema,
  TaskSessionHelpers,
  TaskSerialization
} from './task';

describe('Task Types', () => {
  test('TaskStatus enum should contain expected values', () => {
    expect(Object.values(TaskStatus)).toContain('pending');
    expect(Object.values(TaskStatus)).toContain('running');
    expect(Object.values(TaskStatus)).toContain('completed');
    expect(Object.values(TaskStatus)).toContain('failed');
    expect(Object.values(TaskStatus)).toContain('cancelled');
    expect(Object.values(TaskStatus)).toContain('paused');
  });

  test('TaskPriority enum should contain expected values', () => {
    expect(Object.values(TaskPriority)).toContain('low');
    expect(Object.values(TaskPriority)).toContain('medium');
    expect(Object.values(TaskPriority)).toContain('high');
    expect(Object.values(TaskPriority)).toContain('critical');
  });

  test('TaskCategory enum should contain expected values', () => {
    expect(Object.values(TaskCategory)).toContain('code');
    expect(Object.values(TaskCategory)).toContain('test');
    expect(Object.values(TaskCategory)).toContain('refactor');
    expect(Object.values(TaskCategory)).toContain('analyze');
    expect(Object.values(TaskCategory)).toContain('document');
    expect(Object.values(TaskCategory)).toContain('debug');
    expect(Object.values(TaskCategory)).toContain('optimize');
  });

  test('TaskSchema should validate valid task object', () => {
    const validTask: Task = {
      id: 'task-123',
      title: 'Test Task',
      description: 'A test task for validation',
      category: TaskCategory.CODE,
      priority: TaskPriority.MEDIUM,
      status: TaskStatus.PENDING,
      dependencies: [],
      context: {
        workingDirectory: '/tmp/test'
      },
      createdAt: new Date(),
      updatedAt: new Date()
    };

    const result = TaskSchema.safeParse(validTask);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.id).toBe('task-123');
      expect(result.data.title).toBe('Test Task');
      expect(result.data.category).toBe(TaskCategory.CODE);
    }
  });

  test('TaskSchema should reject invalid task object', () => {
    const invalidTask = {
      id: '', // Empty ID should fail
      title: 'Test Task',
      category: 'invalid-category', // Invalid category
      priority: TaskPriority.MEDIUM,
      status: TaskStatus.PENDING,
      dependencies: [],
      context: {
        workingDirectory: '/tmp/test'
      },
      createdAt: new Date(),
      updatedAt: new Date()
    };

    const result = TaskSchema.safeParse(invalidTask);
    expect(result.success).toBe(false);
  });

  test('CreateTaskInput should contain required fields', () => {
    const createInput: CreateTaskInput = {
      title: 'New Task',
      description: 'Task description',
      category: TaskCategory.TEST,
      context: {}
    };

    expect(createInput.title).toBe('New Task');
    expect(createInput.category).toBe(TaskCategory.TEST);
    expect(createInput.priority).toBeUndefined(); // Optional field
  });
});

describe('Session Support', () => {
  describe('ExecutionMode', () => {
    test('ExecutionMode enum should contain expected values', () => {
      expect(Object.values(ExecutionMode)).toContain('process_pool');
      expect(Object.values(ExecutionMode)).toContain('container_agentic');
    });
  });

  describe('SessionOptions', () => {
    test('SessionOptionsSchema should validate valid session options', () => {
      const validOptions: SessionOptions = {
        repoUrl: 'https://github.com/user/repo.git',
        timeout: 300,
        resourceLimits: {
          memory: 2147483648, // 2GB
          cpu: 2
        },
        environment: {
          NODE_ENV: 'test',
          API_KEY: 'test-key'
        },
        workingDirectory: '/tmp/workspace',
        executionMode: ExecutionMode.CONTAINER_AGENTIC
      };

      const result = SessionOptionsSchema.safeParse(validOptions);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.repoUrl).toBe('https://github.com/user/repo.git');
        expect(result.data.timeout).toBe(300);
        expect(result.data.executionMode).toBe(ExecutionMode.CONTAINER_AGENTIC);
      }
    });

    test('SessionOptionsSchema should accept minimal valid options', () => {
      const minimalOptions: SessionOptions = {};

      const result = SessionOptionsSchema.safeParse(minimalOptions);
      expect(result.success).toBe(true);
    });

    test('SessionOptionsSchema should reject invalid timeout', () => {
      const invalidOptions = {
        timeout: -1 // Negative timeout should fail
      };

      const result = SessionOptionsSchema.safeParse(invalidOptions);
      expect(result.success).toBe(false);
    });
  });

  describe('Session', () => {
    test('SessionSchema should validate valid session object', () => {
      const mockExecutor = { id: 'executor-1', type: 'container' };
      const validSession: Session = {
        id: 'session-123',
        executor: mockExecutor,
        createdAt: Date.now(),
        expiresAt: Date.now() + 3600000, // 1 hour from now
        repoUrl: 'https://github.com/user/repo.git',
        executionMode: ExecutionMode.CONTAINER_AGENTIC,
        status: 'active',
        metadata: {
          workerId: 'worker-1',
          sessionType: 'interactive'
        }
      };

      const result = SessionSchema.safeParse(validSession);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.id).toBe('session-123');
        expect(result.data.status).toBe('active');
        expect(result.data.executionMode).toBe(ExecutionMode.CONTAINER_AGENTIC);
      }
    });

    test('SessionSchema should reject invalid session status', () => {
      const invalidSession = {
        id: 'session-123',
        executor: { id: 'executor-1' },
        createdAt: Date.now(),
        expiresAt: Date.now() + 3600000,
        executionMode: ExecutionMode.PROCESS_POOL,
        status: 'invalid-status' // Invalid status
      };

      const result = SessionSchema.safeParse(invalidSession);
      expect(result.success).toBe(false);
    });

    test('SessionSchema should require executor field', () => {
      const sessionWithoutExecutor = {
        id: 'session-123',
        createdAt: Date.now(),
        expiresAt: Date.now() + 3600000,
        executionMode: ExecutionMode.PROCESS_POOL,
        status: 'active'
        // Missing required executor field
      };

      const result = SessionSchema.safeParse(sessionWithoutExecutor);
      expect(result.success).toBe(false);
    });
  });

  describe('CreateSessionTaskInput', () => {
    test('CreateSessionTaskInputSchema should validate valid input', () => {
      const validInput: CreateSessionTaskInput = {
        title: 'Session Task',
        description: 'A task with session support',
        category: TaskCategory.CODE,
        priority: TaskPriority.HIGH,
        sessionOptions: {
          repoUrl: 'https://github.com/user/repo.git',
          timeout: 600,
          executionMode: ExecutionMode.CONTAINER_AGENTIC
        },
        workingDirectory: '/workspace',
        tags: ['session', 'test'],
        metadata: { version: '1.0' }
      };

      const result = CreateSessionTaskInputSchema.safeParse(validInput);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.title).toBe('Session Task');
        expect(result.data.sessionOptions.executionMode).toBe(ExecutionMode.CONTAINER_AGENTIC);
      }
    });

    test('CreateSessionTaskInputSchema should require sessionOptions', () => {
      const inputWithoutSessionOptions = {
        title: 'Session Task',
        description: 'A task without session options',
        category: TaskCategory.CODE
        // Missing required sessionOptions
      };

      const result = CreateSessionTaskInputSchema.safeParse(inputWithoutSessionOptions);
      expect(result.success).toBe(false);
    });
  });
});

describe('Task with Session Support', () => {
  test('Task with sessionId should validate successfully', () => {
    const taskWithSession: Task = {
      id: 'task-with-session-123',
      title: 'Task with Session',
      description: 'A task that has session support',
      category: TaskCategory.CODE,
      priority: TaskPriority.MEDIUM,
      status: TaskStatus.PENDING,
      dependencies: [],
      context: {
        workingDirectory: '/workspace',
        executionMode: ExecutionMode.CONTAINER_AGENTIC,
        repoUrl: 'https://github.com/user/repo.git',
        timeout: 300000
      },
      createdAt: new Date(),
      updatedAt: new Date(),
      sessionId: 'session-456'
    };

    const result = TaskSchema.safeParse(taskWithSession);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.sessionId).toBe('session-456');
      expect(result.data.context.executionMode).toBe(ExecutionMode.CONTAINER_AGENTIC);
    }
  });

  test('Task with session result should validate successfully', () => {
    const taskWithSessionResult: Task = {
      id: 'task-result-session-123',
      title: 'Task with Session Result',
      description: 'A completed task with session information',
      category: TaskCategory.TEST,
      priority: TaskPriority.LOW,
      status: TaskStatus.COMPLETED,
      dependencies: [],
      context: {
        workingDirectory: '/workspace',
        executionMode: ExecutionMode.PROCESS_POOL
      },
      result: {
        taskId: 'task-result-session-123',
        status: TaskStatus.COMPLETED,
        output: 'Task completed successfully',
        artifacts: [],
        metrics: {
          duration: 15000,
          cpuUsage: 45.5,
          memoryUsage: 1073741824
        },
        logs: ['Starting task...', 'Task completed'],
        exitCode: 0,
        startedAt: new Date('2023-01-01T10:00:00Z'),
        completedAt: new Date('2023-01-01T10:15:00Z'),
        sessionId: 'session-result-789'
      },
      createdAt: new Date(),
      updatedAt: new Date(),
      sessionId: 'session-result-789'
    };

    const result = TaskSchema.safeParse(taskWithSessionResult);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.result?.sessionId).toBe('session-result-789');
      expect(result.data.sessionId).toBe('session-result-789');
    }
  });
});

describe('TaskSessionHelpers', () => {
  test('createTaskContextFromSession should create valid TaskContext', () => {
    const sessionOptions: SessionOptions = {
      repoUrl: 'https://github.com/user/repo.git',
      timeout: 600, // 10 minutes in seconds
      resourceLimits: {
        memory: 2147483648, // 2GB
        cpu: 4
      },
      environment: {
        NODE_ENV: 'production',
        DEBUG: 'false'
      },
      executionMode: ExecutionMode.CONTAINER_AGENTIC
    };

    const context = TaskSessionHelpers.createTaskContextFromSession(
      sessionOptions,
      '/workspace/project',
      'session-helper-123'
    );

    expect(context.workingDirectory).toBe('/workspace/project');
    expect(context.timeout).toBe(600000); // Converted to milliseconds
    expect(context.executionMode).toBe(ExecutionMode.CONTAINER_AGENTIC);
    expect(context.repoUrl).toBe('https://github.com/user/repo.git');
    expect(context.environment).toEqual({
      NODE_ENV: 'production',
      DEBUG: 'false'
    });
    expect(context.resourceLimits?.maxMemoryMB).toBe(2048); // Converted to MB
    expect(context.resourceLimits?.maxCpuPercent).toBe(4);
    expect(context.sessionId).toBe('session-helper-123');
  });

  test('createTaskContextFromSession should handle minimal options', () => {
    const minimalOptions: SessionOptions = {};
    const context = TaskSessionHelpers.createTaskContextFromSession(
      minimalOptions,
      '/workspace'
    );

    expect(context.workingDirectory).toBe('/workspace');
    expect(context.timeout).toBeUndefined();
    expect(context.executionMode).toBeUndefined();
    expect(context.sessionId).toBeUndefined();
  });
});

describe('TaskSerialization', () => {
  test('serializeTask should convert dates to ISO strings', () => {
    const task: Task = {
      id: 'serialize-test-123',
      title: 'Serialization Test',
      description: 'Testing task serialization',
      category: TaskCategory.TEST,
      priority: TaskPriority.MEDIUM,
      status: TaskStatus.COMPLETED,
      dependencies: [],
      context: {
        workingDirectory: '/workspace',
        executionMode: ExecutionMode.PROCESS_POOL
      },
      result: {
        taskId: 'serialize-test-123',
        status: TaskStatus.COMPLETED,
        artifacts: [{
          id: 'artifact-1',
          type: 'file',
          name: 'output.txt',
          path: '/workspace/output.txt',
          createdAt: new Date('2023-01-01T12:00:00Z')
        }],
        metrics: {
          startTime: new Date('2023-01-01T11:00:00Z'),
          endTime: new Date('2023-01-01T12:00:00Z'),
          duration: 3600000
        },
        logs: [],
        startedAt: new Date('2023-01-01T11:00:00Z'),
        completedAt: new Date('2023-01-01T12:00:00Z')
      },
      createdAt: new Date('2023-01-01T10:00:00Z'),
      updatedAt: new Date('2023-01-01T12:00:00Z'),
      sessionId: 'serialize-session-123'
    };

    const serialized = TaskSerialization.serializeTask(task);

    expect(typeof serialized.createdAt).toBe('string');
    expect(typeof serialized.updatedAt).toBe('string');
    expect(serialized.createdAt).toBe('2023-01-01T10:00:00.000Z');
    expect(serialized.updatedAt).toBe('2023-01-01T12:00:00.000Z');
    expect(serialized.sessionId).toBe('serialize-session-123');

    // Check nested result serialization
    const result = serialized.result as Record<string, unknown>;
    expect(typeof result.startedAt).toBe('string');
    expect(typeof result.completedAt).toBe('string');

    // Check artifact date serialization
    const artifacts = result.artifacts as Record<string, unknown>[];
    expect(typeof artifacts[0].createdAt).toBe('string');
    expect(artifacts[0].createdAt).toBe('2023-01-01T12:00:00.000Z');

    // Check metrics date serialization
    const metrics = result.metrics as Record<string, unknown>;
    expect(typeof metrics.startTime).toBe('string');
    expect(typeof metrics.endTime).toBe('string');
  });

  test('deserializeTask should convert ISO strings back to dates', () => {
    const serializedData = {
      id: 'deserialize-test-123',
      title: 'Deserialization Test',
      description: 'Testing task deserialization',
      category: 'test',
      priority: 'medium',
      status: 'completed',
      dependencies: [],
      context: {
        workingDirectory: '/workspace',
        executionMode: 'process_pool'
      },
      result: {
        taskId: 'deserialize-test-123',
        status: 'completed',
        artifacts: [{
          id: 'artifact-1',
          type: 'file',
          name: 'output.txt',
          path: '/workspace/output.txt',
          createdAt: '2023-01-01T12:00:00.000Z'
        }],
        metrics: {
          startTime: '2023-01-01T11:00:00.000Z',
          endTime: '2023-01-01T12:00:00.000Z',
          duration: 3600000
        },
        logs: [],
        startedAt: '2023-01-01T11:00:00.000Z',
        completedAt: '2023-01-01T12:00:00.000Z'
      },
      createdAt: '2023-01-01T10:00:00.000Z',
      updatedAt: '2023-01-01T12:00:00.000Z',
      sessionId: 'deserialize-session-123'
    };

    const task = TaskSerialization.deserializeTask(serializedData);

    expect(task.createdAt instanceof Date).toBe(true);
    expect(task.updatedAt instanceof Date).toBe(true);
    expect(task.createdAt.getTime()).toBe(new Date('2023-01-01T10:00:00.000Z').getTime());
    expect(task.sessionId).toBe('deserialize-session-123');

    // Check nested result deserialization
    expect(task.result?.startedAt instanceof Date).toBe(true);
    expect(task.result?.completedAt instanceof Date).toBe(true);

    // Check artifact date deserialization
    expect(task.result?.artifacts[0].createdAt instanceof Date).toBe(true);

    // Check metrics date deserialization
    expect(task.result?.metrics.startTime instanceof Date).toBe(true);
    expect(task.result?.metrics.endTime instanceof Date).toBe(true);
  });

  test('round-trip serialization should preserve all data', () => {
    const originalTask: Task = {
      id: 'roundtrip-test-123',
      title: 'Round Trip Test',
      description: 'Testing round-trip serialization',
      category: TaskCategory.REFACTOR,
      priority: TaskPriority.HIGH,
      status: TaskStatus.RUNNING,
      dependencies: ['dep-1', 'dep-2'],
      context: {
        workingDirectory: '/workspace',
        executionMode: ExecutionMode.CONTAINER_AGENTIC,
        repoUrl: 'https://github.com/user/repo.git',
        timeout: 300000,
        environment: { NODE_ENV: 'test' }
      },
      createdAt: new Date('2023-01-01T10:00:00Z'),
      updatedAt: new Date('2023-01-01T11:00:00Z'),
      sessionId: 'roundtrip-session-123',
      tags: ['test', 'roundtrip'],
      metadata: { version: '2.0', priority: 1 }
    };

    const serialized = TaskSerialization.serializeTask(originalTask);
    const deserialized = TaskSerialization.deserializeTask(serialized);

    expect(deserialized.id).toBe(originalTask.id);
    expect(deserialized.title).toBe(originalTask.title);
    expect(deserialized.category).toBe(originalTask.category);
    expect(deserialized.context.executionMode).toBe(originalTask.context.executionMode);
    expect(deserialized.sessionId).toBe(originalTask.sessionId);
    expect(deserialized.tags).toEqual(originalTask.tags);
    expect(deserialized.metadata).toEqual(originalTask.metadata);
    expect(deserialized.createdAt.getTime()).toBe(originalTask.createdAt.getTime());
    expect(deserialized.updatedAt.getTime()).toBe(originalTask.updatedAt.getTime());
  });

  test('serializeSessionOptions should validate with schema', () => {
    const sessionOptions: SessionOptions = {
      repoUrl: 'https://github.com/user/repo.git',
      timeout: 300,
      executionMode: ExecutionMode.CONTAINER_AGENTIC
    };

    const serialized = TaskSerialization.serializeSessionOptions(sessionOptions);
    expect(serialized.repoUrl).toBe('https://github.com/user/repo.git');
    expect(serialized.timeout).toBe(300);
    expect(serialized.executionMode).toBe('container_agentic');
  });

  test('batch operations should handle multiple tasks', () => {
    const tasks: Task[] = [
      {
        id: 'batch-1',
        title: 'Batch Task 1',
        description: 'First batch task',
        category: TaskCategory.CODE,
        priority: TaskPriority.LOW,
        status: TaskStatus.PENDING,
        dependencies: [],
        context: { workingDirectory: '/workspace' },
        createdAt: new Date(),
        updatedAt: new Date()
      },
      {
        id: 'batch-2',
        title: 'Batch Task 2',
        description: 'Second batch task',
        category: TaskCategory.TEST,
        priority: TaskPriority.MEDIUM,
        status: TaskStatus.COMPLETED,
        dependencies: ['batch-1'],
        context: { workingDirectory: '/workspace' },
        createdAt: new Date(),
        updatedAt: new Date(),
        sessionId: 'batch-session-456'
      }
    ];

    const serialized = TaskSerialization.serializeTasks(tasks);
    const deserialized = TaskSerialization.deserializeTasks(serialized);

    expect(serialized).toHaveLength(2);
    expect(deserialized).toHaveLength(2);
    expect(deserialized[0].id).toBe('batch-1');
    expect(deserialized[1].id).toBe('batch-2');
    expect(deserialized[1].sessionId).toBe('batch-session-456');
  });
});