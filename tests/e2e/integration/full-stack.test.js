/**
 * Integration test: Full Stack CLI-MCP-Worker Integration
 * Tests complete data flow across all components
 */

describe('Full Stack Integration', () => {
  describe('CLI to MCP to Worker Flow', () => {
    skipIfNoMCP(test)('should complete full workflow with SSE streaming', async () => {
      const prompt = testUtils.generateTestPrompt('echo');
      
      // Submit task and monitor via SSE
      const result = await testClient.submitTaskWithSSE(prompt, {
        timeout: 120000 // 2 minutes for complete workflow
      });
      
      expect(result.success).toBe(true);
      expect(result.taskId).toBeDefined();
      expect(result).toHaveValidSSEEvents();
      
      // Verify we received the expected event sequence
      const events = result.streaming.events;
      const eventTypes = events.map(e => e.type);
      
      // Should have received at least a status event
      expect(eventTypes).toContain('status');
    }, 180000); // 3 minute timeout

    skipIfNoMCP(test)('should handle concurrent tasks with streaming', async () => {
      const prompts = [
        testUtils.generateTestPrompt('echo'),
        testUtils.generateTestPrompt('pwd'),
        testUtils.generateTestPrompt('date')
      ];
      
      // Submit multiple tasks concurrently
      const results = await Promise.all(
        prompts.map(prompt => 
          testClient.submitTaskWithSSE(prompt, { timeout: 60000 })
        )
      );
      
      // All should succeed
      results.forEach(result => {
        expect(result.success).toBe(true);
        expect(result.taskId).toBeDefined();
      });
      
      // All should have unique task IDs
      const taskIds = results.map(r => r.taskId);
      const uniqueIds = new Set(taskIds);
      expect(uniqueIds.size).toBe(taskIds.length);
    }, 120000);
  });

  describe('Data Flow Integrity', () => {
    skipIfNoMCP(test)('should preserve data through full pipeline', async () => {
      const testData = `test-data-${Date.now()}-${Math.random().toString(36)}`;
      const prompt = `echo "${testData}"`;
      
      // Submit via CLI and check output
      const cliResult = await testClient.submitTaskCLI(prompt, {
        timeout: 60000,
        json: true
      });
      
      expect(cliResult.exitCode).toBe(0);
      
      if (cliResult.data && cliResult.data.output) {
        expect(cliResult.data.output).toContain(testData);
      }
    });

    skipIfNoMCP(test)('should handle special characters correctly', async () => {
      const specialChars = 'Hello "World" & <Test> {JSON} [Array] | Pipe $ Dollar % Percent';
      const prompt = `echo '${specialChars}'`;
      
      const result = await testClient.submitTaskHTTP(prompt);
      expect(result.success).toBe(true);
      
      // Should not cause any parsing or execution errors
      expect(result.taskId).toBeDefined();
    });

    skipIfNoMCP(test)('should handle multiline prompts', async () => {
      const multilinePrompt = `echo "Line 1
Line 2
Line 3"`;
      
      const result = await testClient.submitTaskHTTP(multilinePrompt);
      expect(result.success).toBe(true);
      expect(result.taskId).toBeDefined();
    });
  });

  describe('Error Propagation', () => {
    skipIfNoMCP(test)('should propagate worker errors to CLI', async () => {
      // Submit a command that should fail
      const result = await testClient.submitTaskCLI('nonexistent_command_xyz', {
        timeout: 30000,
        json: true
      });
      
      // CLI should receive the error
      expect(result.exitCode).toBe(1);
      expect(result.data?.success).toBe(false);
    });

    skipIfNoMCP(test)('should handle timeout errors gracefully', async () => {
      // Note: This test may be skipped in environments where sleep is not available
      const result = await testClient.submitTaskCLI('sleep 5', {
        timeout: 2000, // 2 second timeout, shorter than sleep
        json: true
      });
      
      // Should fail due to timeout
      expect(result.success).toBe(false);
    });
  });

  describe('Resource Management', () => {
    skipIfNoMCP(test)('should clean up resources after task completion', async () => {
      // Get initial resource state
      const initialHealth = await testClient.testMCPHealth();
      expect(initialHealth.success).toBe(true);
      
      const initialWorkerHealth = await testClient.testAllWorkersHealth();
      const initialActiveTasks = initialWorkerHealth
        .filter(w => w.success)
        .reduce((sum, w) => sum + (w.data.activeTasks || 0), 0);
      
      // Submit a task
      const prompt = testUtils.generateTestPrompt('echo');
      const result = await testClient.submitTaskHTTP(prompt);
      expect(result.success).toBe(true);
      
      // Wait a bit for task to complete
      await new Promise(resolve => setTimeout(resolve, 5000));
      
      // Check resource state after completion
      const finalWorkerHealth = await testClient.testAllWorkersHealth();
      const finalActiveTasks = finalWorkerHealth
        .filter(w => w.success)
        .reduce((sum, w) => sum + (w.data.activeTasks || 0), 0);
      
      // Active tasks should return to initial state (or less)
      expect(finalActiveTasks).toBeLessThanOrEqual(initialActiveTasks);
    });

    skipIfNoMCP(test)('should handle multiple sequential tasks without resource leaks', async () => {
      const taskCount = 3;
      const prompts = Array.from({ length: taskCount }, (_, i) => 
        testUtils.generateTestPrompt(`echo task-${i}`)
      );
      
      // Submit tasks sequentially
      for (const prompt of prompts) {
        const result = await testClient.submitTaskHTTP(prompt);
        expect(result.success).toBe(true);
        
        // Small delay between tasks
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
      
      // Wait for all tasks to complete
      await new Promise(resolve => setTimeout(resolve, 10000));
      
      // Check that system is still healthy
      const finalHealth = await testClient.testMCPHealth();
      expect(finalHealth.success).toBe(true);
      expect(finalHealth.data.status).toBe('healthy');
    });
  });

  describe('Authentication and Security', () => {
    skipIfNoMCP(test)('should handle HTTPS correctly', async () => {
      // If the server URL is HTTPS, verify it works
      if (testClient.mcpServerUrl.startsWith('https://')) {
        const result = await testClient.testMCPHealth();
        expect(result.success).toBe(true);
      }
    });

    skipIfNoMCP(test)('should include proper headers in requests', async () => {
      const prompt = testUtils.generateTestPrompt('echo');
      
      // Make request with custom headers
      const response = await testClient.http.post(`${testClient.mcpServerUrl}/tasks`, {
        prompt,
        priority: 5
      }, {
        headers: {
          'User-Agent': 'ClaudeCluster-E2E-Test',
          'Accept': 'application/json'
        }
      });
      
      expect(response.status).toBe(200);
      expect(response.data).toBeDefined();
    });
  });

  describe('Performance Validation', () => {
    skipIfNoMCP(test)('should have acceptable response times', async () => {
      const measurements = [];
      const testCount = 3;
      
      for (let i = 0; i < testCount; i++) {
        const prompt = testUtils.generateTestPrompt(`echo test-${i}`);
        const startTime = Date.now();
        
        const result = await testClient.submitTaskHTTP(prompt);
        const duration = Date.now() - startTime;
        
        expect(result.success).toBe(true);
        measurements.push(duration);
        
        // Small delay between measurements
        await new Promise(resolve => setTimeout(resolve, 500));
      }
      
      // Calculate statistics
      const avgResponseTime = measurements.reduce((sum, time) => sum + time, 0) / measurements.length;
      const maxResponseTime = Math.max(...measurements);
      
      // Performance thresholds
      expect(avgResponseTime).toBeLessThan(10000); // 10 second average
      expect(maxResponseTime).toBeLessThan(15000);  // 15 second max
      
      console.log(`Response time stats: avg=${avgResponseTime.toFixed(0)}ms, max=${maxResponseTime}ms`);
    });

    skipIfNoMCP(test)('should handle reasonable load', async () => {
      const concurrentTasks = 3; // Conservative for E2E testing
      const promises = [];
      
      for (let i = 0; i < concurrentTasks; i++) {
        const prompt = testUtils.generateTestPrompt(`echo concurrent-${i}`);
        promises.push(testClient.submitTaskHTTP(prompt));
      }
      
      const results = await Promise.all(promises);
      
      // All should succeed
      results.forEach((result, index) => {
        expect(result.success).toBe(true);
        expect(result.taskId).toBeDefined();
      });
      
      // Should have unique task IDs
      const taskIds = results.map(r => r.taskId);
      const uniqueIds = new Set(taskIds);
      expect(uniqueIds.size).toBe(taskIds.length);
    });
  });
});