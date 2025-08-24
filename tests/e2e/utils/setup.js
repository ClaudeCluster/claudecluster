/**
 * Jest setup for ClaudeCluster E2E tests
 */

const { TestClient } = require('./test-client');

// Global test timeout
jest.setTimeout(300000); // 5 minutes

// Global test client
let globalTestClient;

beforeAll(async () => {
  console.log('🚀 Setting up ClaudeCluster E2E tests...');
  
  // Initialize test client
  globalTestClient = new TestClient({
    mcpServerUrl: process.env.TEST_MCP_SERVER_URL,
    workerUrls: (process.env.TEST_WORKER_URLS || '').split(',').filter(Boolean),
    timeout: parseInt(process.env.TEST_TIMEOUT_MS || '300000'),
    verbose: process.env.TEST_VERBOSE === 'true'
  });

  // Make test client available globally
  global.testClient = globalTestClient;
  
  // Verify environment configuration
  if (!globalTestClient.mcpServerUrl) {
    console.warn('⚠️  TEST_MCP_SERVER_URL not set - some tests will be skipped');
  } else {
    console.log(`📡 MCP Server: ${globalTestClient.mcpServerUrl}`);
  }
  
  if (globalTestClient.workerUrls.length === 0) {
    console.warn('⚠️  TEST_WORKER_URLS not set - worker-specific tests will be skipped');
  } else {
    console.log(`👷 Workers: ${globalTestClient.workerUrls.join(', ')}`);
  }

  console.log('✅ E2E test setup completed');
});

afterAll(async () => {
  console.log('🧹 Cleaning up E2E tests...');
  
  if (globalTestClient) {
    globalTestClient.cleanup();
  }
  
  console.log('✅ E2E test cleanup completed');
});

// Helper function to skip tests when services aren't available
global.skipIfNoMCP = (testFn) => {
  return process.env.TEST_MCP_SERVER_URL ? testFn : testFn.skip;
};

global.skipIfNoWorkers = (testFn) => {
  return process.env.TEST_WORKER_URLS ? testFn : testFn.skip;
};

// Custom matchers for E2E testing
expect.extend({
  toBeHealthyResponse(received) {
    const pass = received && 
                 received.success === true &&
                 received.status === 200 &&
                 received.data &&
                 (received.data.status === 'healthy' || received.data.status === 'available');

    if (pass) {
      return {
        message: () => `expected response not to be healthy`,
        pass: true
      };
    } else {
      return {
        message: () => `expected response to be healthy, got: ${JSON.stringify(received)}`,
        pass: false
      };
    }
  },

  toBeSuccessfulTask(received) {
    const pass = received &&
                 received.success === true &&
                 received.exitCode === 0 &&
                 received.data &&
                 received.data.success === true;

    if (pass) {
      return {
        message: () => `expected task not to be successful`,
        pass: true
      };
    } else {
      return {
        message: () => `expected task to be successful, got: ${JSON.stringify(received)}`,
        pass: false
      };
    }
  },

  toHaveValidSSEEvents(received) {
    const pass = received &&
                 received.streaming &&
                 received.streaming.success === true &&
                 Array.isArray(received.streaming.events) &&
                 received.streaming.events.length > 0;

    if (pass) {
      return {
        message: () => `expected not to have valid SSE events`,
        pass: true
      };
    } else {
      return {
        message: () => `expected to have valid SSE events, got: ${JSON.stringify(received?.streaming)}`,
        pass: false
      };
    }
  }
});

// Test utilities
global.testUtils = {
  /**
   * Generate unique test prompt
   */
  generateTestPrompt(base = 'echo') {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(7);
    return `${base} "test-${timestamp}-${random}"`;
  },

  /**
   * Wait for a condition to be true
   */
  async waitFor(condition, options = {}) {
    const timeout = options.timeout || 30000;
    const interval = options.interval || 1000;
    const startTime = Date.now();

    while (Date.now() - startTime < timeout) {
      try {
        const result = await condition();
        if (result) {
          return result;
        }
      } catch (error) {
        // Condition not met yet, continue waiting
      }
      
      await new Promise(resolve => setTimeout(resolve, interval));
    }

    throw new Error(`Condition not met within ${timeout}ms`);
  },

  /**
   * Retry a function with exponential backoff
   */
  async retry(fn, options = {}) {
    const maxAttempts = options.maxAttempts || 3;
    const initialDelay = options.initialDelay || 1000;
    let lastError;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        return await fn();
      } catch (error) {
        lastError = error;
        
        if (attempt === maxAttempts) {
          throw error;
        }

        const delay = initialDelay * Math.pow(2, attempt - 1);
        console.log(`Attempt ${attempt} failed, retrying in ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }

    throw lastError;
  }
};