const { spawn } = require('child_process');

/**
 * Global test teardown - stops the cluster after tests complete
 */
module.exports = async () => {
  console.log('🛑 Stopping ClaudeCluster after E2E tests...');
  
  const environment = process.env.CLUSTER_ENV || 'local';
  
  if (environment === 'local') {
    await teardownLocalCluster();
  }
  
  console.log('✅ ClaudeCluster teardown complete');
};

async function teardownLocalCluster() {
  // Stop Docker Compose services
  console.log('Stopping Docker services...');
  
  const dockerProcess = spawn('docker-compose', ['-f', 'docker-compose.yml', 'down'], {
    stdio: 'pipe',
    cwd: process.cwd()
  });
  
  await new Promise((resolve, reject) => {
    dockerProcess.on('close', (code) => {
      if (code === 0) {
        resolve();
      } else {
        console.warn(`Docker compose down exited with code ${code}, continuing...`);
        resolve();
      }
    });
    
    dockerProcess.on('error', (error) => {
      console.warn('Docker compose down error:', error.message);
      resolve();
    });
    
    // Timeout after 30 seconds
    setTimeout(() => {
      dockerProcess.kill();
      resolve();
    }, 30000);
  });
  
  // Optional: Clean up volumes and networks
  if (process.env.CLEANUP_DOCKER === 'true') {
    console.log('Cleaning up Docker resources...');
    
    const cleanupProcess = spawn('docker-compose', ['-f', 'docker-compose.yml', 'down', '-v', '--remove-orphans'], {
      stdio: 'pipe',
      cwd: process.cwd()
    });
    
    await new Promise((resolve) => {
      cleanupProcess.on('close', () => resolve());
      cleanupProcess.on('error', () => resolve());
      setTimeout(() => {
        cleanupProcess.kill();
        resolve();
      }, 15000);
    });
  }
}