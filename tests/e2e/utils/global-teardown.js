/**
 * Global teardown for ClaudeCluster E2E tests
 * Runs once after all test files complete
 */

module.exports = async () => {
  console.log('🧹 Global E2E test teardown starting...');
  
  // Calculate total test duration
  const setupTime = global.__E2E_SETUP_TIME__;
  const duration = setupTime ? Date.now() - setupTime : 0;
  
  console.log(`⏱️  Total E2E test duration: ${Math.round(duration / 1000)}s`);
  
  // Clean up any global resources
  if (global.__E2E_CLEANUP_TASKS__) {
    console.log('🧼 Running cleanup tasks...');
    
    for (const cleanupTask of global.__E2E_CLEANUP_TASKS__) {
      try {
        await cleanupTask();
      } catch (error) {
        console.warn('⚠️  Cleanup task failed:', error.message);
      }
    }
  }

  // Clear global variables
  delete global.__E2E_MCP_INFO__;
  delete global.__E2E_WORKER_INFO__;
  delete global.__E2E_SETUP_TIME__;
  delete global.__E2E_CLEANUP_TASKS__;
  
  console.log('✅ Global E2E test teardown completed');
};