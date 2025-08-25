/**
 * @fileoverview Simple test to verify our test fixtures work correctly
 * This is a simplified test that doesn't rely on the full engine implementation
 */

import { ExecutionMode } from '../execution/provider';
import {
  createTestTask,
  createSuccessTask,
  createFailureTask,
  createTaskForMode,
  createSuccessResult,
  createFailureResult,
  MockExecutor,
  MockExecutionProvider,
  TestUtils
} from './fixtures';

describe('Test Fixtures', () => {
  describe('Task Creation', () => {
    it('should create basic test tasks', () => {
      const task = createTestTask();
      
      expect(task.id).toBeDefined();
      expect(task.title).toBe('Test Task');
      expect(task.context).toBeDefined();
      expect(task.context.workingDirectory).toBeDefined();
    });

    it('should create success tasks', () => {
      const task = createSuccessTask('test-success');
      
      expect(task.id).toBe('test-success');
      expect(task.title).toBe('Success Test Task');
      expect(task.context.environment?.TEST_MODE).toBe('success');
    });

    it('should create failure tasks', () => {
      const task = createFailureTask('test-failure');
      
      expect(task.id).toBe('test-failure');
      expect(task.title).toBe('Failure Test Task');
      expect(task.context.environment?.TEST_MODE).toBe('failure');
    });

    it('should create tasks for specific execution modes', () => {
      const processTask = createTaskForMode(ExecutionMode.PROCESS_POOL);
      const containerTask = createTaskForMode(ExecutionMode.CONTAINER_AGENTIC);
      
      expect(processTask.context.executionMode).toBe(ExecutionMode.PROCESS_POOL);
      expect(containerTask.context.executionMode).toBe(ExecutionMode.CONTAINER_AGENTIC);
    });
  });

  describe('Result Creation', () => {
    it('should create success results', () => {
      const result = createSuccessResult('task-1');
      
      TestUtils.assertTaskSuccess(result);
      TestUtils.assertValidTaskResult(result);
      expect(result.taskId).toBe('task-1');
      expect(result.output).toContain('successfully');
    });

    it('should create failure results', () => {
      const result = createFailureResult('task-2', 'Test error');
      
      TestUtils.assertTaskFailure(result, 'Test error');
      TestUtils.assertValidTaskResult(result);
      expect(result.taskId).toBe('task-2');
    });
  });

  describe('Mock Executor', () => {
    it('should create and execute tasks successfully by default', async () => {
      const executor = new MockExecutor('test-executor', ExecutionMode.PROCESS_POOL);
      const task = createSuccessTask('executor-test-1');
      
      expect(executor.isHealthy()).toBe(true);
      expect(executor.getStatus().id).toBe('test-executor');
      
      const result = await executor.execute(task);
      TestUtils.assertTaskSuccess(result);
    });

    it('should fail when configured to fail', async () => {
      const executor = new MockExecutor('failing-executor', ExecutionMode.PROCESS_POOL, true);
      const task = createSuccessTask('executor-fail-test');
      
      const result = await executor.execute(task);
      TestUtils.assertTaskFailure(result, 'Mock executor failure');
    });

    it('should handle task-specific failure mode', async () => {
      const executor = new MockExecutor('test-executor', ExecutionMode.PROCESS_POOL, false);
      const task = createFailureTask('env-fail-test');
      
      const result = await executor.execute(task);
      TestUtils.assertTaskFailure(result);
    });
  });

  describe('Mock Execution Provider', () => {
    it('should provide executors and manage them', async () => {
      const provider = new MockExecutionProvider(ExecutionMode.PROCESS_POOL);
      const task = createTaskForMode(ExecutionMode.PROCESS_POOL);
      
      expect(provider.getMode()).toBe(ExecutionMode.PROCESS_POOL);
      expect(provider.isHealthy()).toBe(true);
      
      const executor = await provider.getExecutor(task, ExecutionMode.PROCESS_POOL);
      expect(executor).toBeDefined();
      expect(executor.isHealthy()).toBe(true);
      
      await provider.release(executor);
      const stats = provider.getStats();
      expect(stats.mode).toBe(ExecutionMode.PROCESS_POOL);
      
      await provider.cleanup();
    });

    it('should handle both execution modes', async () => {
      const processProvider = new MockExecutionProvider(ExecutionMode.PROCESS_POOL);
      const containerProvider = new MockExecutionProvider(ExecutionMode.CONTAINER_AGENTIC);
      
      expect(processProvider.getMode()).toBe(ExecutionMode.PROCESS_POOL);
      expect(containerProvider.getMode()).toBe(ExecutionMode.CONTAINER_AGENTIC);
      
      const processTask = createTaskForMode(ExecutionMode.PROCESS_POOL);
      const containerTask = createTaskForMode(ExecutionMode.CONTAINER_AGENTIC);
      
      const processExecutor = await processProvider.getExecutor(processTask, ExecutionMode.PROCESS_POOL);
      const containerExecutor = await containerProvider.getExecutor(containerTask, ExecutionMode.CONTAINER_AGENTIC);
      
      expect(processExecutor.getStatus().mode).toBe(ExecutionMode.PROCESS_POOL);
      expect(containerExecutor.getStatus().mode).toBe(ExecutionMode.CONTAINER_AGENTIC);
      
      await processProvider.cleanup();
      await containerProvider.cleanup();
    });
  });

  describe('Test Utilities', () => {
    it('should validate assertion utilities', () => {
      const successResult = createSuccessResult('success-test');
      const failureResult = createFailureResult('failure-test', 'Test failure');
      
      // These should not throw
      TestUtils.assertTaskSuccess(successResult);
      TestUtils.assertTaskFailure(failureResult, 'Test failure');
      TestUtils.assertValidTaskResult(successResult);
      TestUtils.assertValidTaskResult(failureResult);
      TestUtils.assertExecutionTime(successResult, 4000, 6000);
    });

    it('should handle waitFor utility', async () => {
      let condition = false;
      
      // Set condition to true after 100ms
      setTimeout(() => { condition = true; }, 100);
      
      await TestUtils.waitFor(() => condition, 1000);
      expect(condition).toBe(true);
    });

    it('should timeout when waitFor condition is not met', async () => {
      await expect(
        TestUtils.waitFor(() => false, 200)
      ).rejects.toThrow(/Condition not met/);
    });
  });
});

/**
 * Basic execution simulation test
 */
describe('Basic Execution Simulation', () => {
  [ExecutionMode.PROCESS_POOL, ExecutionMode.CONTAINER_AGENTIC].forEach(mode => {
    describe(`in ${mode} mode`, () => {
      it('should simulate successful task execution', async () => {
        const provider = new MockExecutionProvider(mode);
        const task = createTaskForMode(mode, { id: `sim-success-${mode}` });
        
        const executor = await provider.getExecutor(task, mode);
        const result = await executor.execute(task);
        
        TestUtils.assertTaskSuccess(result);
        expect(result.taskId).toBe(task.id);
        
        await provider.release(executor);
        await provider.cleanup();
      });

      it('should simulate failed task execution', async () => {
        const provider = new MockExecutionProvider(mode, true); // Configure to fail
        const task = createTaskForMode(mode, { id: `sim-failure-${mode}` });
        
        const executor = await provider.getExecutor(task, mode);
        const result = await executor.execute(task);
        
        TestUtils.assertTaskFailure(result);
        expect(result.taskId).toBe(task.id);
        
        await provider.release(executor);
        await provider.cleanup();
      });

      it('should provide consistent interface across modes', async () => {
        const provider = new MockExecutionProvider(mode);
        const task = createTaskForMode(mode);
        
        expect(provider.getMode()).toBe(mode);
        expect(provider.isHealthy()).toBe(true);
        
        const stats = provider.getStats();
        expect(stats.mode).toBe(mode);
        expect(typeof stats.totalExecutors).toBe('number');
        
        await provider.cleanup();
      });
    });
  });
});