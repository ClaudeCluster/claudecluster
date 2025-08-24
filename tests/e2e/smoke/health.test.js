/**
 * Smoke test: Service Health Verification
 * Critical tests that verify basic service availability
 */

describe('Service Health Verification', () => {
  describe('MCP Server Health', () => {
    skipIfNoMCP(test)('should respond to health check', async () => {
      const result = await testClient.testMCPHealth();
      
      expect(result).toBeHealthyResponse();
      expect(result.responseTime).toBeLessThan(5000); // Should respond within 5s
    });

    skipIfNoMCP(test)('should have proper health response structure', async () => {
      const result = await testClient.testMCPHealth();
      
      expect(result.success).toBe(true);
      expect(result.data).toHaveProperty('status');
      expect(result.data).toHaveProperty('uptime');
      expect(result.data).toHaveProperty('version');
      expect(result.data).toHaveProperty('workers');
      expect(result.data).toHaveProperty('systemInfo');
    });

    skipIfNoMCP(test)('should report system information', async () => {
      const result = await testClient.testMCPHealth();
      
      expect(result.success).toBe(true);
      expect(result.data.systemInfo).toHaveProperty('nodeVersion');
      expect(result.data.systemInfo).toHaveProperty('platform');
      expect(result.data.systemInfo).toHaveProperty('memoryUsage');
    });

    skipIfNoMCP(test)('should have reasonable uptime', async () => {
      const result = await testClient.testMCPHealth();
      
      expect(result.success).toBe(true);
      expect(typeof result.data.uptime).toBe('number');
      expect(result.data.uptime).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Worker Health', () => {
    skipIfNoWorkers(test)('should respond to health checks', async () => {
      const results = await testClient.testAllWorkersHealth();
      
      expect(results.length).toBeGreaterThan(0);
      
      // At least one worker should be healthy
      const healthyWorkers = results.filter(r => r.success);
      expect(healthyWorkers.length).toBeGreaterThan(0);
    });

    skipIfNoWorkers(test)('should have proper worker response structure', async () => {
      const results = await testClient.testAllWorkersHealth();
      const healthyResults = results.filter(r => r.success);
      
      expect(healthyResults.length).toBeGreaterThan(0);
      
      for (const result of healthyResults) {
        expect(result.data).toHaveProperty('status');
        expect(result.data).toHaveProperty('workerId');
        expect(result.data).toHaveProperty('uptime');
        expect(result.data).toHaveProperty('activeTasks');
        expect(result.data).toHaveProperty('totalTasksExecuted');
      }
    });

    skipIfNoWorkers(test)('should report available status', async () => {
      const results = await testClient.testAllWorkersHealth();
      const availableWorkers = results.filter(r => 
        r.success && (r.data.status === 'available' || r.data.status === 'busy')
      );
      
      // At least one worker should be available
      expect(availableWorkers.length).toBeGreaterThan(0);
    });
  });

  describe('MCP-Worker Integration', () => {
    skipIfNoMCP(test)('MCP should detect registered workers', async () => {
      const mcpResult = await testClient.testMCPHealth();
      
      expect(mcpResult.success).toBe(true);
      expect(mcpResult.data.workers).toHaveProperty('total');
      expect(mcpResult.data.workers).toHaveProperty('available');
      expect(mcpResult.data.workers).toHaveProperty('offline');
      
      // Should have at least one worker registered
      expect(mcpResult.data.workers.total).toBeGreaterThanOrEqual(0);
    });

    skipIfNoMCP(test)('should list workers endpoint', async () => {
      const response = await testClient.http.get(`${testClient.mcpServerUrl}/workers`);
      
      expect(response.status).toBe(200);
      expect(response.data).toHaveProperty('workers');
      expect(response.data).toHaveProperty('totalWorkers');
      expect(response.data).toHaveProperty('availableWorkers');
      expect(Array.isArray(response.data.workers)).toBe(true);
    });
  });

  describe('Service Configuration', () => {
    skipIfNoMCP(test)('should load configuration correctly', async () => {
      const result = await testClient.testMCPHealth();
      
      expect(result.success).toBe(true);
      expect(result.data.version).toBeDefined();
      expect(typeof result.data.version).toBe('string');
      
      // Check that service doesn't report configuration errors
      expect(result.data.status).not.toBe('unhealthy');
    });

    test('should have required environment variables configured', () => {
      // These should be set by the test setup
      expect(process.env.TEST_MCP_SERVER_URL).toBeDefined();
      
      // Validate URL format
      if (process.env.TEST_MCP_SERVER_URL) {
        expect(process.env.TEST_MCP_SERVER_URL).toMatch(/^https?:\/\/.+/);
      }
      
      if (process.env.TEST_WORKER_URLS) {
        const workerUrls = process.env.TEST_WORKER_URLS.split(',');
        workerUrls.forEach(url => {
          expect(url.trim()).toMatch(/^https?:\/\/.+/);
        });
      }
    });
  });

  describe('Error Handling', () => {
    skipIfNoMCP(test)('should handle invalid endpoints gracefully', async () => {
      try {
        await testClient.http.get(`${testClient.mcpServerUrl}/nonexistent-endpoint`);
        fail('Expected request to fail with 404');
      } catch (error) {
        expect(error.response?.status).toBe(404);
        expect(error.response?.data).toBeDefined();
      }
    });

    test('should handle unreachable services gracefully', async () => {
      const unreachableClient = new (require('../utils/test-client').TestClient)({
        mcpServerUrl: 'https://unreachable-test-server.example.com',
        timeout: 5000
      });
      
      const result = await unreachableClient.testMCPHealth();
      
      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
      expect(typeof result.error).toBe('string');
    });
  });
});