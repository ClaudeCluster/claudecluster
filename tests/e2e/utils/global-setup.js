/**
 * Global setup for ClaudeCluster E2E tests
 * Runs once before all test files
 */

const { TestClient } = require('./test-client');

module.exports = async () => {
  console.log('🔧 Global E2E test setup starting...');
  
  // Verify required environment variables
  const requiredEnvVars = ['TEST_MCP_SERVER_URL'];
  const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);
  
  if (missingVars.length > 0) {
    console.warn(`⚠️  Missing environment variables: ${missingVars.join(', ')}`);
    console.warn('Some tests will be skipped or may fail');
  }

  // Create test client for setup validation
  const setupClient = new TestClient({
    mcpServerUrl: process.env.TEST_MCP_SERVER_URL,
    workerUrls: (process.env.TEST_WORKER_URLS || '').split(',').filter(Boolean),
    timeout: 30000, // Short timeout for setup
    verbose: process.env.TEST_VERBOSE === 'true'
  });

  // Wait for services to be ready (if URLs are provided)
  if (setupClient.mcpServerUrl) {
    console.log('🏥 Waiting for MCP server to be healthy...');
    
    try {
      const healthResult = await setupClient.waitForHealthy(setupClient.mcpServerUrl, {
        maxAttempts: 15,
        interval: 2000
      });

      if (healthResult.success) {
        console.log('✅ MCP server is healthy');
        
        // Store server info for tests
        global.__E2E_MCP_INFO__ = healthResult.data;
      } else {
        console.warn('⚠️  MCP server is not healthy, tests may fail');
      }
    } catch (error) {
      console.warn(`⚠️  Failed to verify MCP server health: ${error.message}`);
    }
  }

  // Check worker health (if URLs are provided)
  if (setupClient.workerUrls.length > 0) {
    console.log('👷 Checking worker health...');
    
    try {
      const workerResults = await setupClient.testAllWorkersHealth();
      const healthyWorkers = workerResults.filter(r => r.success);
      
      console.log(`✅ ${healthyWorkers.length}/${workerResults.length} workers are healthy`);
      
      // Store worker info for tests
      global.__E2E_WORKER_INFO__ = workerResults;
    } catch (error) {
      console.warn(`⚠️  Failed to check worker health: ${error.message}`);
    }
  }

  // Set global test environment
  process.env.NODE_ENV = process.env.NODE_ENV || 'test';
  
  console.log('✅ Global E2E test setup completed');
  
  // Store setup timestamp
  global.__E2E_SETUP_TIME__ = Date.now();
};