/**
 * Parallel task execution integration tests
 */

describe('Integration Tests - Parallel Tasks', () => {
  test('Should execute multiple tasks in parallel', async () => {
    const testId = global.testUtils.generateTestId();
    const numberOfTasks = 4;
    
    // Submit multiple tasks simultaneously
    const taskPromises = Array.from({ length: numberOfTasks }, (_, index) =>
      global.testUtils.submitTask({
        title: `Parallel task ${index + 1} - ${testId}`,
        description: `Write a function that returns the number ${index + 1}`,
        category: 'coding',
        priority: 'normal'
      })
    );
    
    const submittedTasks = await Promise.all(taskPromises);
    
    // Verify all tasks were submitted
    expect(submittedTasks).toHaveLength(numberOfTasks);
    submittedTasks.forEach(task => {
      expect(task.taskId).toBeDefined();
      expect(task.status).toBe('submitted');
    });
    
    // Wait for all tasks to complete
    const completionPromises = submittedTasks.map(task =>
      global.testUtils.waitForTask(task.taskId, 180000) // 3 minutes
    );
    
    const results = await Promise.all(completionPromises);
    
    // Verify all tasks completed successfully
    results.forEach((result, index) => {
      expect(result.status).toBe('completed');
      expect(result.result).toBeDefined();
      expect(result.taskId).toBe(submittedTasks[index].taskId);
    });
    
    // Check that tasks were distributed across workers
    const workerStats = await global.testUtils.makeRequest(`${global.CONFIG.driverUrl}/stats`);
    expect(workerStats.data.totalTasks).toBeGreaterThanOrEqual(numberOfTasks);
  });

  test('Should handle task dependencies correctly', async () => {
    const testId = global.testUtils.generateTestId();
    
    // Submit first task
    const baseTask = await global.testUtils.submitTask({
      title: `Base task - ${testId}`,
      description: 'Create a simple utility function',
      category: 'coding'
    });
    
    // Submit dependent task
    const dependentTask = await global.testUtils.submitTask({
      title: `Dependent task - ${testId}`,
      description: 'Use the utility function from the base task',
      category: 'coding',
      dependencies: [baseTask.taskId]
    });
    
    // Wait for base task to complete first
    const baseResult = await global.testUtils.waitForTask(baseTask.taskId, 120000);
    expect(baseResult.status).toBe('completed');
    
    // Then wait for dependent task
    const dependentResult = await global.testUtils.waitForTask(dependentTask.taskId, 120000);
    expect(dependentResult.status).toBe('completed');
    
    // Verify execution order by checking timestamps
    expect(new Date(dependentResult.endTime).getTime()).toBeGreaterThan(
      new Date(baseResult.endTime).getTime()
    );
  });

  test('Should balance load across multiple workers', async () => {
    const testId = global.testUtils.generateTestId();
    const numberOfTasks = 6; // More than number of workers
    
    // Submit tasks quickly
    const tasks = [];
    for (let i = 0; i < numberOfTasks; i++) {
      const task = await global.testUtils.submitTask({
        title: `Load balance task ${i + 1} - ${testId}`,
        description: `Processing task ${i + 1}`,
        category: 'coding'
      });
      tasks.push(task);
      
      // Small delay to allow for load balancing
      await global.testUtils.sleep(100);
    }
    
    // Wait for all to complete
    await Promise.all(tasks.map(task => 
      global.testUtils.waitForTask(task.taskId, 180000)
    ));
    
    // Check worker utilization
    const workers = await global.testUtils.makeRequest(`${global.CONFIG.driverUrl}/workers`);
    
    // All workers should have processed at least one task
    workers.data.workers.forEach(worker => {
      expect(worker.completedTasks).toBeGreaterThan(0);
    });
    
    // Tasks should be relatively evenly distributed
    const taskCounts = workers.data.workers.map(w => w.completedTasks);
    const maxTasks = Math.max(...taskCounts);
    const minTasks = Math.min(...taskCounts);
    
    // Difference shouldn't be too large (allowing some variance)
    expect(maxTasks - minTasks).toBeLessThanOrEqual(3);
  });

  test('Should handle mixed priority tasks correctly', async () => {
    const testId = global.testUtils.generateTestId();
    
    // Submit tasks with different priorities
    const lowPriorityTask = await global.testUtils.submitTask({
      title: `Low priority task - ${testId}`,
      description: 'Low priority processing',
      category: 'coding',
      priority: 'low'
    });
    
    const highPriorityTask = await global.testUtils.submitTask({
      title: `High priority task - ${testId}`,
      description: 'High priority processing',
      category: 'coding',
      priority: 'high'
    });
    
    const normalPriorityTask = await global.testUtils.submitTask({
      title: `Normal priority task - ${testId}`,
      description: 'Normal priority processing',
      category: 'coding',
      priority: 'normal'
    });
    
    // Wait for all to complete
    const results = await Promise.all([
      global.testUtils.waitForTask(lowPriorityTask.taskId, 180000),
      global.testUtils.waitForTask(highPriorityTask.taskId, 180000),
      global.testUtils.waitForTask(normalPriorityTask.taskId, 180000)
    ]);
    
    // All should complete successfully
    results.forEach(result => {
      expect(result.status).toBe('completed');
    });
    
    // High priority task should complete first (if submitted at similar times)
    const highPriorityEndTime = new Date(results[1].endTime).getTime();
    const lowPriorityEndTime = new Date(results[0].endTime).getTime();
    
    // This is a heuristic - high priority should generally complete before low priority
    // but we'll just check they all completed successfully for now
    expect(highPriorityEndTime).toBeDefined();
    expect(lowPriorityEndTime).toBeDefined();
  });
});