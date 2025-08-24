/**
 * Resilience test: Failure Simulation and Recovery
 * Tests system behavior during failures and recovery scenarios
 */

describe('Failure Simulation and Recovery', () => {
  describe('Network Failures', () => {
    skipIfNoMCP(test)('should handle network timeouts gracefully', async () => {
      const prompt = testUtils.generateTestPrompt('echo');
      
      // Create client with very short timeout
      const shortTimeoutClient = new (require('../utils/test-client').TestClient)({
        mcpServerUrl: testClient.mcpServerUrl,
        timeout: 100 // 100ms timeout to force failure
      });
      
      const result = await shortTimeoutClient.submitTaskHTTP(prompt);
      
      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.error).toMatch(/timeout|ECONNRESET|ETIMEDOUT/i);
    });

    skipIfNoMCP(test)('should recover from temporary network issues', async () => {
      const prompt = testUtils.generateTestPrompt('echo');
      
      // First, simulate failure with unreachable endpoint
      const unreachableClient = new (require('../utils/test-client').TestClient)({
        mcpServerUrl: 'https://unreachable-endpoint.example.com',
        timeout: 5000
      });
      
      const failureResult = await unreachableClient.submitTaskHTTP(prompt);
      expect(failureResult.success).toBe(false);
      
      // Then verify normal client still works (recovery)
      const recoveryResult = await testClient.submitTaskHTTP(prompt);
      expect(recoveryResult.success).toBe(true);
    });

    skipIfNoMCP(test)('should handle partial response failures', async () => {
      const prompt = testUtils.generateTestPrompt('echo');
      
      // Submit task that should work
      const result = await testClient.submitTaskHTTP(prompt);
      expect(result.success).toBe(true);
      
      // Try to query status with invalid task ID
      try {
        await testClient.http.get(`${testClient.mcpServerUrl}/tasks/invalid-task-id/status`);
        fail('Expected request to fail with invalid task ID');
      } catch (error) {
        expect([400, 404]).toContain(error.response?.status);
      }
    });
  });

  describe('Service Degradation', () => {
    skipIfNoMCP(test)('should handle overloaded system gracefully', async () => {
      const concurrentTasks = 10; // Higher load to test limits
      const promises = [];
      
      // Submit many tasks simultaneously
      for (let i = 0; i < concurrentTasks; i++) {
        const prompt = testUtils.generateTestPrompt(`overload-test-${i}`);
        promises.push(
          testClient.submitTaskHTTP(prompt, { priority: Math.ceil(Math.random() * 10) })
            .catch(error => ({ success: false, error: error.message }))
        );
      }
      
      const results = await Promise.all(promises);
      
      // At least some should succeed, system shouldn't completely fail
      const successCount = results.filter(r => r.success).length;
      const failureCount = results.filter(r => !r.success).length;
      
      expect(successCount).toBeGreaterThan(0);
      console.log(`Load test: ${successCount} succeeded, ${failureCount} failed of ${concurrentTasks} total`);
      
      // System should still be responsive after load test
      await new Promise(resolve => setTimeout(resolve, 2000)); // Brief cooldown
      
      const healthCheck = await testClient.testMCPHealth();
      expect(healthCheck.success).toBe(true);
    });

    skipIfNoMCP(test)('should maintain service during worker failures', async () => {
      // Get initial worker health
      const initialWorkers = await testClient.testAllWorkersHealth();
      const healthyWorkers = initialWorkers.filter(w => w.success);
      
      if (healthyWorkers.length === 0) {
        console.log('Skipping worker failure test - no healthy workers available');
        return;
      }
      
      // Submit task normally
      const normalTask = testUtils.generateTestPrompt('echo');
      const normalResult = await testClient.submitTaskHTTP(normalTask);
      expect(normalResult.success).toBe(true);
      
      // Even if some workers are failing, MCP should still function
      const mcpHealth = await testClient.testMCPHealth();
      expect(mcpHealth.success).toBe(true);
      expect(mcpHealth.data.status).not.toBe('unhealthy');
    });
  });

  describe('Error Propagation', () => {
    skipIfNoMCP(test)('should propagate command execution errors', async () => {
      // Submit a command that will definitely fail
      const result = await testClient.submitTaskCLI('this-command-does-not-exist-anywhere', {
        timeout: 30000,
        json: true
      });
      
      expect(result.success).toBe(false);
      expect(result.exitCode).not.toBe(0);
      expect(result.stderr || result.data?.error || result.error).toBeDefined();
    });

    skipIfNoMCP(test)('should handle malformed task requests', async () => {
      const malformedRequests = [
        { }, // Empty object
        { prompt: '' }, // Empty prompt
        { prompt: null }, // Null prompt
        { prompt: 'test', priority: 'invalid' }, // Invalid priority type
        { prompt: 'test', workerId: 123 }, // Invalid worker ID type
      ];
      
      for (const request of malformedRequests) {
        try {
          await testClient.http.post(`${testClient.mcpServerUrl}/tasks`, request);
          fail(`Expected malformed request to fail: ${JSON.stringify(request)}`);
        } catch (error) {
          expect(error.response?.status).toBe(400);
          expect(error.response?.data?.error).toBeDefined();
        }
      }
    });

    skipIfNoMCP(test)('should provide meaningful error messages', async () => {
      try {
        // Try to submit to non-existent endpoint
        await testClient.http.post(`${testClient.mcpServerUrl}/nonexistent`, {
          prompt: 'test'
        });
        fail('Expected 404 error');
      } catch (error) {
        expect(error.response?.status).toBe(404);
        expect(error.response?.data).toBeDefined();
      }
    });
  });

  describe('System Recovery', () => {
    skipIfNoMCP(test)('should maintain consistency during failures', async () => {
      // Submit multiple tasks, some may fail due to system stress
      const taskCount = 5;
      const promises = [];
      
      for (let i = 0; i < taskCount; i++) {
        const prompt = testUtils.generateTestPrompt(`consistency-test-${i}`);
        promises.push(
          testClient.submitTaskHTTP(prompt)
            .catch(error => ({ 
              success: false, 
              error: error.message,
              taskIndex: i 
            }))
        );
      }
      
      const results = await Promise.all(promises);
      
      // Check that all successful results have valid structure
      const successfulResults = results.filter(r => r.success);
      
      successfulResults.forEach(result => {
        expect(result.data).toHaveProperty('taskId');
        expect(result.data.taskId).toMatch(/^task-/);
        expect(result.data).toHaveProperty('status');
      });
      
      // Ensure task IDs are unique even under stress
      const taskIds = successfulResults.map(r => r.data.taskId);
      const uniqueIds = new Set(taskIds);
      expect(uniqueIds.size).toBe(taskIds.length);
    });

    skipIfNoMCP(test)('should recover service health after errors', async () => {
      // Cause some errors first
      const errorPromises = [];
      for (let i = 0; i < 3; i++) {
        errorPromises.push(
          testClient.submitTaskHTTP('').catch(() => ({ failed: true }))
        );
      }
      
      await Promise.all(errorPromises);
      
      // Wait a moment for any cleanup
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // Verify system recovered and is healthy
      const healthResult = await testClient.testMCPHealth();
      expect(healthResult.success).toBe(true);
      expect(healthResult.data.status).not.toBe('unhealthy');
      
      // Verify normal operations still work
      const normalTask = testUtils.generateTestPrompt('recovery-test');
      const normalResult = await testClient.submitTaskHTTP(normalTask);
      expect(normalResult.success).toBe(true);
    });

    skipIfNoMCP(test)('should handle resource cleanup after failures', async () => {
      // Get initial resource state
      const initialHealth = await testClient.testMCPHealth();
      expect(initialHealth.success).toBe(true);
      
      // Cause some load/stress
      const stressTasks = [];
      for (let i = 0; i < 5; i++) {
        stressTasks.push(
          testClient.submitTaskHTTP(
            testUtils.generateTestPrompt(`stress-${i}`)
          ).catch(() => ({ failed: true }))
        );
      }
      
      await Promise.all(stressTasks);
      
      // Allow time for cleanup
      await new Promise(resolve => setTimeout(resolve, 3000));
      
      // Check final resource state
      const finalHealth = await testClient.testMCPHealth();
      expect(finalHealth.success).toBe(true);
      
      // System should be stable
      expect(finalHealth.data.status).toBe('healthy');
    });
  });

  describe('Data Integrity', () => {
    skipIfNoMCP(test)('should maintain task data integrity during errors', async () => {
      const testData = `integrity-test-${Date.now()}`;
      const prompt = `echo "${testData}"`;
      
      // Submit task normally
      const result = await testClient.submitTaskHTTP(prompt);
      expect(result.success).toBe(true);
      
      const taskId = result.data.taskId;
      expect(taskId).toBeDefined();
      
      // Try to query task status (may or may not be implemented)
      try {
        const statusResponse = await testClient.http.get(
          `${testClient.mcpServerUrl}/tasks/${taskId}/status`
        );
        
        if (statusResponse.status === 200) {
          expect(statusResponse.data).toHaveProperty('taskId', taskId);
        }
      } catch (error) {
        // Status endpoint may not be implemented, that's OK
        if (error.response?.status !== 404) {
          throw error;
        }
      }
    });

    skipIfNoMCP(test)('should handle concurrent task submissions without data corruption', async () => {
      const concurrentCount = 3;
      const promises = [];
      const testDataSets = [];
      
      // Create unique data for each concurrent task
      for (let i = 0; i < concurrentCount; i++) {
        const testData = `concurrent-${Date.now()}-${i}-${Math.random().toString(36)}`;
        testDataSets.push(testData);
        promises.push(
          testClient.submitTaskHTTP(`echo "${testData}"`)
        );
      }
      
      const results = await Promise.all(promises);
      
      // All should succeed
      results.forEach((result, index) => {
        expect(result.success).toBe(true);
        expect(result.data.taskId).toBeDefined();
      });
      
      // All task IDs should be unique
      const taskIds = results.map(r => r.data.taskId);
      const uniqueIds = new Set(taskIds);
      expect(uniqueIds.size).toBe(taskIds.length);
    });
  });
});