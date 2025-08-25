/**
 * Basic health check smoke tests
 */

describe('Smoke Tests - Basic Health', () => {
  test('All services should be healthy', async () => {
    const health = await global.testUtils.checkHealth();
    
    expect(health).toHaveLength(4); // MCP, Driver, Worker 1, Worker 2
    
    health.forEach(service => {
      expect(service.healthy).toBe(true);
      expect(service.data).toBeTruthy();
      expect(service.error).toBeNull();
    });
  });

  test('MCP server should respond to health check', async () => {
    const response = await global.testUtils.makeRequest(`${global.CONFIG.mcpUrl}/health`);
    
    expect(response.status).toBe(200);
    expect(response.data).toMatchObject({
      status: 'healthy',
      uptime: expect.any(Number)
    });
  });

  test('Driver should respond to health check', async () => {
    const response = await global.testUtils.makeRequest(`${global.CONFIG.driverUrl}/health`);
    
    expect(response.status).toBe(200);
    expect(response.data).toMatchObject({
      status: 'healthy',
      uptime: expect.any(Number)
    });
  });

  test('Workers should respond to health checks', async () => {
    for (const [index, workerUrl] of global.CONFIG.workerUrls.entries()) {
      const response = await global.testUtils.makeRequest(`${workerUrl}/health`);
      
      expect(response.status).toBe(200);
      expect(response.data).toMatchObject({
        status: 'healthy',
        uptime: expect.any(Number)
      });
    }
  });

  test('Driver should report connected workers', async () => {
    const response = await global.testUtils.makeRequest(`${global.CONFIG.driverUrl}/workers`);
    
    expect(response.status).toBe(200);
    expect(response.data.workers).toHaveLength(2);
    
    response.data.workers.forEach(worker => {
      expect(worker).toMatchObject({
        id: expect.any(String),
        status: 'idle',
        capabilities: expect.any(Array)
      });
    });
  });
});