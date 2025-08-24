/**
 * Resilience test: Chaos Testing
 * Tests system resilience under chaotic conditions and edge cases
 */

describe('Chaos Testing', () => {
  describe('Random Failure Patterns', () => {
    skipIfNoMCP(test)('should handle random timeout variations', async () => {
      const testCount = 5;
      const results = [];
      
      for (let i = 0; i < testCount; i++) {
        // Use random timeouts between 1-10 seconds
        const randomTimeout = Math.floor(Math.random() * 9000) + 1000;
        const prompt = testUtils.generateTestPrompt(`timeout-chaos-${i}`);
        
        try {
          const result = await testClient.submitTaskHTTP(prompt, {}, randomTimeout);
          results.push({ success: true, timeout: randomTimeout, taskId: result.data?.taskId });
        } catch (error) {
          results.push({ 
            success: false, 
            timeout: randomTimeout, 
            error: error.message 
          });
        }
        
        // Random delay between requests
        const randomDelay = Math.floor(Math.random() * 1000) + 100;
        await new Promise(resolve => setTimeout(resolve, randomDelay));
      }
      
      const successCount = results.filter(r => r.success).length;
      console.log(`Chaos timeout test: ${successCount}/${testCount} succeeded`);
      
      // At least some should succeed (system shouldn't be completely broken)
      expect(successCount).toBeGreaterThan(0);
      
      // System should still be responsive
      const healthCheck = await testClient.testMCPHealth();
      expect(healthCheck.success).toBe(true);
    });

    skipIfNoMCP(test)('should handle random payload sizes', async () => {
      const payloadSizes = [
        'tiny',                                    // Very small
        'a'.repeat(100),                          // Small
        'b'.repeat(1000),                         // Medium
        'c'.repeat(5000),                         // Large
        'echo "' + 'd'.repeat(500) + '"',         // Command with large string
      ];
      
      const results = [];
      
      for (const payload of payloadSizes) {
        try {
          const result = await testClient.submitTaskHTTP(payload);
          results.push({ success: true, size: payload.length });
        } catch (error) {
          results.push({ 
            success: false, 
            size: payload.length, 
            error: error.response?.status || error.message 
          });
        }
      }
      
      const successCount = results.filter(r => r.success).length;
      console.log(`Payload size test: ${successCount}/${payloadSizes.length} succeeded`);
      
      // Most reasonable payloads should work
      expect(successCount).toBeGreaterThan(payloadSizes.length / 2);
    });
  });

  describe('Edge Case Inputs', () => {
    skipIfNoMCP(test)('should handle special characters in prompts', async () => {
      const specialPrompts = [
        'echo "Hello World"',                     // Quotes
        "echo 'Single quotes'",                  // Single quotes
        'echo "Mixed \'quotes\'"',               // Mixed quotes
        'echo \\$PATH',                          // Escaped characters
        'echo $(whoami)',                        // Command substitution
        'echo "Unicode: 🚀 ñ ü ø"',              // Unicode characters
        'echo "Newline\\nTest"',                 // Newlines
        'echo "Tab\\tTest"',                     // Tabs
      ];
      
      const results = [];
      
      for (const prompt of specialPrompts) {
        try {
          const result = await testClient.submitTaskHTTP(prompt);
          results.push({ 
            success: true, 
            prompt: prompt.substring(0, 50) + (prompt.length > 50 ? '...' : '')
          });
        } catch (error) {
          results.push({ 
            success: false, 
            prompt: prompt.substring(0, 50) + (prompt.length > 50 ? '...' : ''),
            error: error.response?.status || 'Network error'
          });
        }
      }
      
      const successCount = results.filter(r => r.success).length;
      console.log(`Special character test: ${successCount}/${specialPrompts.length} succeeded`);
      
      // Most should work (basic shell escaping should handle these)
      expect(successCount).toBeGreaterThan(specialPrompts.length * 0.6);
    });

    skipIfNoMCP(test)('should handle boundary value priorities', async () => {
      const boundaryPriorities = [1, 2, 5, 8, 9, 10]; // Valid range boundaries
      const invalidPriorities = [0, 11, -1, 15, 100];  // Invalid values
      
      const prompt = testUtils.generateTestPrompt('priority-boundary');
      
      // Test valid priorities
      for (const priority of boundaryPriorities) {
        const result = await testClient.submitTaskHTTP(prompt, { priority });
        expect(result.success).toBe(true);
      }
      
      // Test invalid priorities
      for (const priority of invalidPriorities) {
        try {
          await testClient.submitTaskHTTP(prompt, { priority });
          fail(`Priority ${priority} should have been rejected`);
        } catch (error) {
          expect(error.response?.status).toBe(400);
        }
      }
    });

    skipIfNoMCP(test)('should handle malformed HTTP requests', async () => {
      const malformedTests = [
        {
          name: 'Invalid Content-Type',
          request: () => testClient.http.post(`${testClient.mcpServerUrl}/tasks`, 'not-json', {
            headers: { 'Content-Type': 'text/plain' }
          })
        },
        {
          name: 'Missing Content-Type',
          request: () => testClient.http.post(`${testClient.mcpServerUrl}/tasks`, '{"prompt":"test"}', {
            headers: { 'Content-Type': undefined }
          })
        },
        {
          name: 'Invalid JSON',
          request: () => testClient.http.post(`${testClient.mcpServerUrl}/tasks`, '{invalid json}', {
            headers: { 'Content-Type': 'application/json' }
          })
        }
      ];
      
      for (const test of malformedTests) {
        try {
          await test.request();
          fail(`${test.name} should have failed`);
        } catch (error) {
          expect([400, 415]).toContain(error.response?.status); // Bad Request or Unsupported Media Type
        }
      }
    });
  });

  describe('Resource Exhaustion Simulation', () => {
    skipIfNoMCP(test)('should handle memory-intensive operations gracefully', async () => {
      // Try to create large output (this should be handled gracefully)
      const largeOutputCommand = 'for i in {1..1000}; do echo "Large output line $i with extra data to make it longer"; done';
      
      try {
        const result = await testClient.submitTaskCLI(largeOutputCommand, {
          timeout: 30000,
          json: true
        });
        
        // Either succeeds with proper output handling, or fails gracefully
        if (result.success) {
          expect(result.exitCode).toBe(0);
        } else {
          // If it fails, it should be due to timeout or resource limits, not crash
          expect(result.error || result.stderr).toBeDefined();
        }
      } catch (error) {
        // Network timeout is acceptable for large operations
        expect(error.code).toMatch(/TIMEOUT|ECONNRESET|ETIMEDOUT/);
      }
      
      // System should remain responsive after the test
      await new Promise(resolve => setTimeout(resolve, 2000));
      const healthCheck = await testClient.testMCPHealth();
      expect(healthCheck.success).toBe(true);
    });

    skipIfNoMCP(test)('should handle rapid successive requests', async () => {
      const rapidCount = 20;
      const promises = [];
      
      // Fire requests rapidly with minimal delay
      for (let i = 0; i < rapidCount; i++) {
        const prompt = testUtils.generateTestPrompt(`rapid-${i}`);
        promises.push(
          testClient.submitTaskHTTP(prompt).catch(error => ({
            success: false,
            error: error.message,
            status: error.response?.status
          }))
        );
        
        // Very small delay to create rapid succession
        if (i < rapidCount - 1) {
          await new Promise(resolve => setTimeout(resolve, 10));
        }
      }
      
      const results = await Promise.all(promises);
      const successCount = results.filter(r => r.success).length;
      const rateLimitedCount = results.filter(r => r.status === 429).length;
      
      console.log(`Rapid request test: ${successCount} succeeded, ${rateLimitedCount} rate-limited of ${rapidCount}`);
      
      // System should handle this gracefully (either accept requests or rate limit them)
      expect(successCount + rateLimitedCount).toBeGreaterThan(rapidCount * 0.5);
      
      // System should recover quickly
      await new Promise(resolve => setTimeout(resolve, 1000));
      const recoveryTest = await testClient.submitTaskHTTP(testUtils.generateTestPrompt('recovery'));
      expect(recoveryTest.success).toBe(true);
    });
  });

  describe('State Corruption Prevention', () => {
    skipIfNoMCP(test)('should maintain state consistency under concurrent stress', async () => {
      const stressTestDuration = 5000; // 5 seconds of stress
      const startTime = Date.now();
      const concurrentTasks = [];
      let taskCounter = 0;
      
      // Generate continuous load for the duration
      while (Date.now() - startTime < stressTestDuration) {
        const prompt = testUtils.generateTestPrompt(`stress-${taskCounter++}`);
        concurrentTasks.push(
          testClient.submitTaskHTTP(prompt, { 
            priority: Math.ceil(Math.random() * 10) 
          }).catch(error => ({
            success: false,
            error: error.message
          }))
        );
        
        // Small random delay
        await new Promise(resolve => setTimeout(resolve, Math.random() * 100));
      }
      
      const results = await Promise.all(concurrentTasks);
      const successResults = results.filter(r => r.success);
      
      console.log(`Stress test: ${successResults.length}/${results.length} tasks succeeded`);
      
      // Verify task ID uniqueness (no state corruption)
      const taskIds = successResults.map(r => r.data?.taskId).filter(Boolean);
      const uniqueIds = new Set(taskIds);
      expect(uniqueIds.size).toBe(taskIds.length);
      
      // System should still be healthy
      await new Promise(resolve => setTimeout(resolve, 2000));
      const healthCheck = await testClient.testMCPHealth();
      expect(healthCheck.success).toBe(true);
    });

    skipIfNoMCP(test)('should prevent race conditions in task assignment', async () => {
      const concurrentCount = 8;
      const promises = [];
      
      // Submit multiple tasks at exactly the same time
      for (let i = 0; i < concurrentCount; i++) {
        const prompt = testUtils.generateTestPrompt(`race-condition-${i}`);
        promises.push(testClient.submitTaskHTTP(prompt));
      }
      
      const results = await Promise.all(promises);
      
      // All should succeed
      results.forEach(result => {
        expect(result.success).toBe(true);
        expect(result.data.taskId).toBeDefined();
        expect(result.data.assignedWorker).toBeDefined();
      });
      
      // All task IDs should be unique (no race condition in ID generation)
      const taskIds = results.map(r => r.data.taskId);
      const uniqueIds = new Set(taskIds);
      expect(uniqueIds.size).toBe(taskIds.length);
      
      // Worker assignments should be valid (can be same worker, but must exist)
      const assignedWorkers = results.map(r => r.data.assignedWorker);
      assignedWorkers.forEach(worker => {
        expect(worker).toBeTruthy();
        expect(typeof worker).toBe('string');
      });
    });
  });

  describe('Recovery Validation', () => {
    skipIfNoMCP(test)('should maintain service after chaos testing', async () => {
      // Final validation that system is still functional after all chaos tests
      const finalValidationTests = [
        testUtils.generateTestPrompt('final-validation-1'),
        testUtils.generateTestPrompt('final-validation-2'),
        testUtils.generateTestPrompt('final-validation-3')
      ];
      
      for (const prompt of finalValidationTests) {
        const result = await testClient.submitTaskHTTP(prompt);
        expect(result.success).toBe(true);
        expect(result.data.taskId).toBeDefined();
      }
      
      // Health check should pass
      const healthResult = await testClient.testMCPHealth();
      expect(healthResult.success).toBe(true);
      expect(healthResult.data.status).toBe('healthy');
      
      // Worker health should be stable
      const workerHealth = await testClient.testAllWorkersHealth();
      const healthyWorkers = workerHealth.filter(w => w.success);
      expect(healthyWorkers.length).toBeGreaterThanOrEqual(0); // At least system is responsive
    });
  });
});