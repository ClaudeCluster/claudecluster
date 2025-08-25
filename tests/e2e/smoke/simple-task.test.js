/**
 * Simple task submission smoke tests
 */

describe('Smoke Tests - Simple Task', () => {
  test('Should submit and complete a simple task', async () => {
    const testId = global.testUtils.generateTestId();
    
    // Submit a simple task
    const task = await global.testUtils.submitTask({
      title: `Smoke test task ${testId}`,
      description: 'Write a simple "Hello, World!" function in JavaScript',
      category: 'coding',
      priority: 'normal'
    });
    
    expect(task.taskId).toBeDefined();
    expect(task.status).toBe('submitted');
    
    // Wait for task completion (with shorter timeout for smoke test)
    const result = await global.testUtils.waitForTask(task.taskId, 60000); // 1 minute
    
    expect(result.status).toBe('completed');
    expect(result.result).toBeDefined();
  });

  test('Should handle task with invalid parameters', async () => {
    // Try to submit a task with missing required fields
    try {
      await global.testUtils.makeRequest(`${global.CONFIG.driverUrl}/tasks`, {
        method: 'POST',
        data: {
          // Missing title and description
          category: 'coding'
        },
        headers: {
          'Content-Type': 'application/json'
        }
      });
      
      // Should not reach here
      expect(true).toBe(false);
    } catch (error) {
      expect(error.response.status).toBe(400);
    }
  });

  test('Should return task status for submitted task', async () => {
    const testId = global.testUtils.generateTestId();
    
    const task = await global.testUtils.submitTask({
      title: `Status check task ${testId}`,
      description: 'Simple task for status checking',
      category: 'testing'
    });
    
    // Check status immediately
    const statusResponse = await global.testUtils.makeRequest(`${global.CONFIG.driverUrl}/tasks/${task.taskId}`);
    
    expect(statusResponse.status).toBe(200);
    expect(statusResponse.data).toMatchObject({
      taskId: task.taskId,
      status: expect.stringMatching(/^(pending|running|completed)$/),
      startTime: expect.any(String)
    });
  });

  test('Should list submitted tasks', async () => {
    // Submit a test task first
    const testId = global.testUtils.generateTestId();
    const task = await global.testUtils.submitTask({
      title: `List test task ${testId}`,
      description: 'Task for testing list functionality'
    });
    
    // List all tasks
    const listResponse = await global.testUtils.makeRequest(`${global.CONFIG.driverUrl}/tasks`);
    
    expect(listResponse.status).toBe(200);
    expect(listResponse.data.tasks).toBeInstanceOf(Array);
    
    // Find our submitted task
    const ourTask = listResponse.data.tasks.find(t => t.id === task.taskId);
    expect(ourTask).toBeDefined();
    expect(ourTask.title).toContain(testId);
  });
});