const { spawn } = require('child_process');
const axios = require('axios');

/**
 * Global test setup - starts the cluster before running tests
 */
module.exports = async () => {
  console.log('🚀 Starting ClaudeCluster for E2E tests...');
  
  const environment = process.env.CLUSTER_ENV || 'local';
  
  if (environment === 'local') {
    await setupLocalCluster();
  } else {
    await validateCloudCluster();
  }
  
  console.log('✅ ClaudeCluster setup complete');
};

async function setupLocalCluster() {
  // Start Docker Compose services
  console.log('Starting Docker services...');
  
  const dockerProcess = spawn('docker-compose', ['-f', 'docker-compose.yml', 'up', '-d'], {
    stdio: 'pipe',
    cwd: process.cwd()
  });
  
  await new Promise((resolve, reject) => {
    dockerProcess.on('close', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`Docker compose failed with code ${code}`));
      }
    });
    
    dockerProcess.on('error', reject);
  });
  
  // Wait for services to be ready
  await waitForService('http://localhost:3100/health', 'MCP Server');
  await waitForService('http://localhost:3002/health', 'Driver');
  await waitForService('http://localhost:3001/health', 'Worker 1');
  await waitForService('http://localhost:3003/health', 'Worker 2');
}

async function validateCloudCluster() {
  console.log('Validating cloud cluster endpoints...');
  
  const endpoints = [
    process.env.CLOUD_MCP_URL || 'https://claudecluster-mcp-dev-123456.us-central1.run.app',
    process.env.CLOUD_DRIVER_URL || 'https://claudecluster-driver-dev-123456.us-central1.run.app'
  ];
  
  for (const endpoint of endpoints) {
    await waitForService(`${endpoint}/health`, `Cloud service: ${endpoint}`);
  }
}

async function waitForService(url, serviceName, maxAttempts = 30, interval = 2000) {
  console.log(`Waiting for ${serviceName} at ${url}...`);
  
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const response = await axios.get(url, { timeout: 5000 });
      
      if (response.status === 200) {
        console.log(`✅ ${serviceName} is ready`);
        return;
      }
    } catch (error) {
      if (attempt === maxAttempts) {
        throw new Error(`${serviceName} failed to start after ${maxAttempts} attempts`);
      }
      
      console.log(`${serviceName} not ready (attempt ${attempt}/${maxAttempts}), retrying in ${interval}ms...`);
      await sleep(interval);
    }
  }
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}