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
  Task
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