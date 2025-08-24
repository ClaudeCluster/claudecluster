/**
 * Smoke test: Basic Task Submission
 * Critical tests for fundamental task execution functionality
 */

describe('Basic Task Submission', () => {
  describe('HTTP API Task Submission', () => {
    skipIfNoMCP(test)('should submit and execute simple echo task', async () => {
      const prompt = testUtils.generateTestPrompt('echo');
      const result = await testClient.submitTaskHTTP(prompt);
      
      expect(result.success).toBe(true);
      expect(result.status).toBe(200);
      expect(result.taskId).toBeDefined();
      expect(result.data).toHaveProperty('taskId');
      expect(result.data).toHaveProperty('status');
    });

    skipIfNoMCP(test)('should handle task priority', async () => {
      const prompt = testUtils.generateTestPrompt('echo');
      const result = await testClient.submitTaskHTTP(prompt, { priority: 8 });
      
      expect(result.success).toBe(true);
      expect(result.data.taskId).toBeDefined();
    });

    skipIfNoMCP(test)('should assign task to worker', async () => {
      const prompt = testUtils.generateTestPrompt('echo');
      const result = await testClient.submitTaskHTTP(prompt);
      
      expect(result.success).toBe(true);
      expect(result.data).toHaveProperty('assignedWorker');
    });

    skipIfNoMCP(test)('should validate required fields', async () => {
      try {
        await testClient.http.post(`${testClient.mcpServerUrl}/tasks`, {});
        fail('Expected request to fail with validation error');
      } catch (error) {
        expect(error.response?.status).toBe(400);
        expect(error.response?.data?.error).toBeDefined();
      }
    });
  });

  describe('CLI Task Submission', () => {
    skipIfNoMCP(test)('should execute simple task via CLI', async () => {
      const prompt = testUtils.generateTestPrompt('echo');
      const result = await testClient.submitTaskCLI(prompt, { 
        timeout: 60000, // 1 minute timeout for CLI
        json: true 
      });
      
      expect(result).toBeSuccessfulTask();
      expect(result.data.taskId).toBeDefined();
      expect(result.duration).toBeLessThan(60000); // Should complete within 1 minute
    });

    skipIfNoMCP(test)('should handle CLI options correctly', async () => {
      const prompt = testUtils.generateTestPrompt('echo');
      const result = await testClient.submitTaskCLI(prompt, {
        priority: 7,
        timeout: 30000,
        verbose: true,
        json: true
      });
      
      expect(result.exitCode).toBe(0);
      expect(result.data).toBeDefined();
    });

    skipIfNoMCP(test)('should handle simple command execution', async () => {
      // Test basic command that should work in most environments
      const result = await testClient.submitTaskCLI('pwd', {
        timeout: 30000,
        json: true
      });
      
      expect(result.exitCode).toBe(0);
      
      if (result.data && result.data.output) {
        expect(typeof result.data.output).toBe('string');
        expect(result.data.output.length).toBeGreaterThan(0);
      }
    });

    skipIfNoMCP(test)('should provide meaningful error messages', async () => {
      // Test with invalid server URL
      const invalidClient = new (require('../utils/test-client').TestClient)({
        mcpServerUrl: 'https://invalid-server-url.example.com'
      });
      
      const result = await invalidClient.submitTaskCLI('echo test', {
        timeout: 10000,
        json: true
      });
      
      expect(result.success).toBe(false);
      expect(result.stderr).toBeDefined();
      expect(result.stderr.length).toBeGreaterThan(0);
    });
  });

  describe('Task Response Validation', () => {
    skipIfNoMCP(test)('should return proper task response structure', async () => {
      const prompt = testUtils.generateTestPrompt('echo');
      const result = await testClient.submitTaskHTTP(prompt);
      
      expect(result.success).toBe(true);
      expect(result.data).toHaveProperty('success');
      expect(result.data).toHaveProperty('taskId');
      expect(result.data).toHaveProperty('status');
      expect(result.data.taskId).toMatch(/^task-/); // Should have task- prefix
    });

    skipIfNoMCP(test)('should have reasonable response times', async () => {
      const prompt = testUtils.generateTestPrompt('echo');
      const startTime = Date.now();
      const result = await testClient.submitTaskHTTP(prompt);
      const responseTime = Date.now() - startTime;
      
      expect(result.success).toBe(true);
      expect(responseTime).toBeLessThan(10000); // Should respond within 10 seconds
    });

    skipIfNoMCP(test)('should generate unique task IDs', async () => {
      const prompt = testUtils.generateTestPrompt('echo');
      
      // Submit multiple tasks
      const results = await Promise.all([
        testClient.submitTaskHTTP(prompt),
        testClient.submitTaskHTTP(prompt),
        testClient.submitTaskHTTP(prompt)
      ]);
      
      // All should succeed
      results.forEach(result => expect(result.success).toBe(true));
      
      // All task IDs should be unique
      const taskIds = results.map(r => r.data.taskId);
      const uniqueIds = new Set(taskIds);
      expect(uniqueIds.size).toBe(taskIds.length);
    });
  });

  describe('Worker Assignment', () => {
    skipIfNoMCP(test)('should distribute tasks to available workers', async () => {
      const prompt = testUtils.generateTestPrompt('echo');
      
      // Submit multiple tasks to see worker distribution
      const results = await Promise.all([
        testClient.submitTaskHTTP(prompt),
        testClient.submitTaskHTTP(prompt),
        testClient.submitTaskHTTP(prompt)
      ]);
      
      // All should succeed and have assigned workers
      results.forEach(result => {
        expect(result.success).toBe(true);
        expect(result.data.assignedWorker).toBeDefined();
      });
      
      // Get unique assigned workers
      const assignedWorkers = new Set(results.map(r => r.data.assignedWorker));
      expect(assignedWorkers.size).toBeGreaterThanOrEqual(1);
    });

    skipIfNoMCP(test)('should respect worker specification', async () => {
      // First get available workers
      const workersResponse = await testClient.http.get(`${testClient.mcpServerUrl}/workers`);
      
      if (workersResponse.data.workers.length > 0) {
        const specificWorker = workersResponse.data.workers[0].id || workersResponse.data.workers[0].workerId;
        
        if (specificWorker) {
          const prompt = testUtils.generateTestPrompt('echo');
          const result = await testClient.submitTaskHTTP(prompt, { 
            workerId: specificWorker 
          });
          
          expect(result.success).toBe(true);
          expect(result.data.assignedWorker).toBe(specificWorker);
        }
      }
    });
  });

  describe('Basic Error Scenarios', () => {
    skipIfNoMCP(test)('should handle empty prompt gracefully', async () => {
      try {
        await testClient.submitTaskHTTP('');
        fail('Expected empty prompt to be rejected');
      } catch (error) {
        expect(error.response?.status).toBe(400);
      }
    });

    skipIfNoMCP(test)('should handle invalid priority values', async () => {
      const prompt = testUtils.generateTestPrompt('echo');
      
      try {
        await testClient.submitTaskHTTP(prompt, { priority: 15 }); // Invalid priority > 10
        fail('Expected invalid priority to be rejected');
      } catch (error) {
        expect(error.response?.status).toBe(400);
      }
    });

    skipIfNoMCP(test)('should handle malformed JSON gracefully', async () => {
      try {
        const response = await testClient.http.post(`${testClient.mcpServerUrl}/tasks`, 'invalid json', {
          headers: { 'Content-Type': 'application/json' }
        });
        fail('Expected malformed JSON to be rejected');
      } catch (error) {
        expect(error.response?.status).toBe(400);
      }
    });
  });
});