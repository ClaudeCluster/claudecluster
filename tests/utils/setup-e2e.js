const axios = require('axios');

// Configure test environment
global.CLUSTER_CONFIG = {
  local: {
    mcpUrl: 'http://localhost:3100',
    driverUrl: 'http://localhost:3002',
    workerUrls: ['http://localhost:3001', 'http://localhost:3003']
  },
  cloud: {
    mcpUrl: process.env.CLOUD_MCP_URL || 'https://claudecluster-mcp-dev-123456.us-central1.run.app',
    driverUrl: process.env.CLOUD_DRIVER_URL || 'https://claudecluster-driver-dev-123456.us-central1.run.app',
    workerUrls: [
      process.env.CLOUD_WORKER1_URL || 'https://claudecluster-worker1-dev-123456.us-central1.run.app',
      process.env.CLOUD_WORKER2_URL || 'https://claudecluster-worker2-dev-123456.us-central1.run.app'
    ]
  }
};

const environment = process.env.CLUSTER_ENV || 'local';
global.CONFIG = global.CLUSTER_CONFIG[environment];

// Test utilities
global.testUtils = {
  /**
   * Make HTTP request with retry
   */
  async makeRequest(url, options = {}, maxRetries = 3) {
    let lastError;
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await axios({
          timeout: 10000,
          ...options,
          url
        });
      } catch (error) {
        lastError = error;
        
        if (attempt === maxRetries) {
          throw lastError;
        }
        
        // Wait before retry
        await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
      }
    }
  },

  /**
   * Submit a test task
   */
  async submitTask(task) {
    const response = await this.makeRequest(`${global.CONFIG.driverUrl}/tasks`, {
      method: 'POST',
      data: {
        title: 'Test Task',
        description: 'E2E test task',
        category: 'testing',
        priority: 'normal',
        ...task
      },
      headers: {
        'Content-Type': 'application/json'
      }
    });
    
    return response.data;
  },

  /**
   * Wait for task completion
   */
  async waitForTask(taskId, timeoutMs = 300000) {
    const startTime = Date.now();
    
    while (Date.now() - startTime < timeoutMs) {
      try {
        const response = await this.makeRequest(`${global.CONFIG.driverUrl}/tasks/${taskId}`);
        const status = response.data.status;
        
        if (status === 'completed' || status === 'failed') {
          return response.data;
        }
        
        await new Promise(resolve => setTimeout(resolve, 1000));
      } catch (error) {
        // Task might not exist yet, continue waiting
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
    
    throw new Error(`Task ${taskId} did not complete within ${timeoutMs}ms`);
  },

  /**
   * Check cluster health
   */
  async checkHealth() {
    const healthChecks = [
      { name: 'MCP Server', url: `${global.CONFIG.mcpUrl}/health` },
      { name: 'Driver', url: `${global.CONFIG.driverUrl}/health` }
    ];
    
    // Add worker health checks
    global.CONFIG.workerUrls.forEach((url, index) => {
      healthChecks.push({
        name: `Worker ${index + 1}`,
        url: `${url}/health`
      });
    });
    
    const results = await Promise.allSettled(
      healthChecks.map(async (check) => {
        const response = await this.makeRequest(check.url);
        return { name: check.name, healthy: response.status === 200, data: response.data };
      })
    );
    
    return results.map((result, index) => ({
      name: healthChecks[index].name,
      healthy: result.status === 'fulfilled' ? result.value.healthy : false,
      data: result.status === 'fulfilled' ? result.value.data : null,
      error: result.status === 'rejected' ? result.reason.message : null
    }));
  },

  /**
   * Generate unique test ID
   */
  generateTestId() {
    return `test-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  },

  /**
   * Sleep utility
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
};

// Global test timeout
jest.setTimeout(300000); // 5 minutes default

// Setup and teardown for each test
beforeEach(async () => {
  // Verify cluster is healthy before each test
  const health = await global.testUtils.checkHealth();
  const unhealthyServices = health.filter(service => !service.healthy);
  
  if (unhealthyServices.length > 0) {
    console.warn('Unhealthy services detected:', unhealthyServices.map(s => s.name).join(', '));
    
    // Try to wait for services to recover
    await global.testUtils.sleep(5000);
    
    const recheck = await global.testUtils.checkHealth();
    const stillUnhealthy = recheck.filter(service => !service.healthy);
    
    if (stillUnhealthy.length > 0) {
      throw new Error(`Services are unhealthy: ${stillUnhealthy.map(s => s.name).join(', ')}`);
    }
  }
});

// Global error handling
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
});