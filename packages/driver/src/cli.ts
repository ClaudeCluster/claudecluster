#!/usr/bin/env node

/**
 * @fileoverview CLI entry point for ClaudeCluster Driver
 */

import { startDriverServer, type ClaudeDriverConfig } from './driver.js';

// Parse command line arguments
const args = process.argv.slice(2);
const config: any = {};

// Parse basic arguments
for (let i = 0; i < args.length; i++) {
  const arg = args[i];
  const nextArg = args[i + 1];

  switch (arg) {
    case '--port':
    case '-p':
      if (nextArg && !isNaN(Number(nextArg))) {
        config.port = Number(nextArg);
        i++;
      }
      break;
    
    case '--host':
    case '-h':
      if (nextArg) {
        config.host = nextArg;
        i++;
      }
      break;
    
    case '--driver-id':
    case '-d':
      if (nextArg) {
        config.driverId = nextArg;
        i++;
      }
      break;
    
    case '--name':
    case '-n':
      if (nextArg) {
        config.name = nextArg;
        i++;
      }
      break;
    
    case '--max-tasks':
    case '-m':
      if (nextArg && !isNaN(Number(nextArg))) {
        config.maxConcurrentTasks = Number(nextArg);
        i++;
      }
      break;
    
    case '--task-timeout':
      if (nextArg && !isNaN(Number(nextArg))) {
        config.taskTimeout = Number(nextArg) * 1000; // Convert seconds to milliseconds
        i++;
      }
      break;
    
    case '--worker-health-interval':
      if (nextArg && !isNaN(Number(nextArg))) {
        config.workerHealthCheckInterval = Number(nextArg) * 1000; // Convert seconds to milliseconds
        i++;
      }
      break;
    
    case '--enable-decomposition':
      config.enableTaskDecomposition = true;
      break;
    
    case '--disable-decomposition':
      config.enableTaskDecomposition = false;
      break;
    
    case '--enable-merging':
      config.enableResultMerging = true;
      break;
    
    case '--disable-merging':
      config.enableResultMerging = false;
      break;
    
    case '--enable-retry':
      config.retryFailedTasks = true;
      break;
    
    case '--disable-retry':
      config.retryFailedTasks = false;
      break;
    
    case '--enable-websocket':
      config.enableWebSocket = true;
      break;
    
    case '--disable-websocket':
      config.enableWebSocket = false;
      break;
    
    case '--cors-origin':
      if (nextArg) {
        config.corsOrigin = nextArg.split(',');
        i++;
      }
      break;
    
    case '--help':
      showHelp();
      process.exit(0);
      break;
    
    case '--version':
      console.log('0.1.0');
      process.exit(0);
      break;
    
    default:
      if (arg.startsWith('-')) {
        console.error(`Unknown option: ${arg}`);
        showHelp();
        process.exit(1);
      }
      break;
  }
}

function showHelp() {
  console.log(`
ClaudeCluster Driver v0.1.0

USAGE:
  claudecluster-driver [OPTIONS]

OPTIONS:
  -p, --port <number>                Port to listen on (default: 3000)
  -h, --host <string>                Host to bind to (default: 0.0.0.0)
  -d, --driver-id <string>           Unique driver ID (default: auto-generated)
  -n, --name <string>                Driver display name
  -m, --max-tasks <number>           Maximum concurrent tasks (default: 100)
  
  --task-timeout <seconds>           Task timeout in seconds (default: 600)
  --worker-health-interval <seconds> Worker health check interval (default: 30)
  
  --enable-decomposition             Enable automatic task decomposition (default)
  --disable-decomposition            Disable automatic task decomposition
  --enable-merging                   Enable result merging (default)
  --disable-merging                  Disable result merging
  --enable-retry                     Enable task retry on failure (default)
  --disable-retry                    Disable task retry on failure
  
  --enable-websocket                 Enable WebSocket support (default)
  --disable-websocket                Disable WebSocket support
  --cors-origin <origins>            CORS allowed origins (comma-separated)
  
  --help                             Show this help message
  --version                          Show version number

EXAMPLES:
  claudecluster-driver --port 3000 --max-tasks 200
  claudecluster-driver --driver-id cluster-main --name "Main Cluster Driver"
  claudecluster-driver --task-timeout 900 --disable-decomposition
  claudecluster-driver --cors-origin "http://localhost:3000,https://app.example.com"

API ENDPOINTS:
  Health:
    GET  /health                     Health check
    GET  /health/ready               Readiness check  
    GET  /health/live                Liveness check
  
  Tasks:
    POST /tasks                      Submit task
    POST /tasks/batch                Submit batch tasks
    GET  /tasks                      List tasks
    GET  /tasks/{id}                 Get task status
    GET  /tasks/{id}/result          Get task result
    GET  /tasks/{id}/progress        Get task progress
    DELETE /tasks/{id}               Cancel task
  
  Workers:
    POST /workers                    Register worker
    GET  /workers                    List workers
    GET  /workers/{id}               Get worker details
    GET  /workers/{id}/health        Get worker health
    DELETE /workers/{id}             Unregister worker
  
  Driver:
    GET  /driver                     Driver status
    POST /driver/start               Start driver
    POST /driver/stop                Stop driver
    GET  /metrics                    Get metrics
    GET  /stats                      Get statistics
  
  Scheduler:
    GET  /scheduler/stats            Scheduler statistics
    GET  /scheduler/queue            Task queue status
    GET  /scheduler/plans            Execution plans
  
  WebSocket (if enabled):
    WS   /ws/tasks/{id}/progress     Real-time task progress
    WS   /ws/stats                   Real-time driver statistics

ENVIRONMENT VARIABLES:
  DRIVER_PORT                        Port to listen on
  DRIVER_HOST                        Host to bind to
  DRIVER_ID                          Driver ID
  DRIVER_NAME                        Driver display name
  MAX_CONCURRENT_TASKS               Maximum concurrent tasks
  TASK_TIMEOUT                       Task timeout in seconds
  WORKER_HEALTH_INTERVAL             Worker health check interval
  ENABLE_TASK_DECOMPOSITION          Enable task decomposition (true/false)
  ENABLE_RESULT_MERGING              Enable result merging (true/false)
  RETRY_FAILED_TASKS                 Retry failed tasks (true/false)
  ENABLE_WEBSOCKET                   Enable WebSocket support (true/false)
  CORS_ORIGIN                        CORS allowed origins (comma-separated)
  NODE_ENV                           Environment (development/production)

For more information, visit: https://github.com/claudecluster/claudecluster
`);
}

// Apply environment variables
if (process.env.DRIVER_PORT) {
  config.port = Number(process.env.DRIVER_PORT);
}
if (process.env.DRIVER_HOST) {
  config.host = process.env.DRIVER_HOST;
}
if (process.env.DRIVER_ID) {
  config.driverId = process.env.DRIVER_ID;
}
if (process.env.DRIVER_NAME) {
  config.name = process.env.DRIVER_NAME;
}
if (process.env.MAX_CONCURRENT_TASKS) {
  config.maxConcurrentTasks = Number(process.env.MAX_CONCURRENT_TASKS);
}
if (process.env.TASK_TIMEOUT) {
  config.taskTimeout = Number(process.env.TASK_TIMEOUT) * 1000;
}
if (process.env.WORKER_HEALTH_INTERVAL) {
  config.workerHealthCheckInterval = Number(process.env.WORKER_HEALTH_INTERVAL) * 1000;
}
if (process.env.ENABLE_TASK_DECOMPOSITION) {
  config.enableTaskDecomposition = process.env.ENABLE_TASK_DECOMPOSITION === 'true';
}
if (process.env.ENABLE_RESULT_MERGING) {
  config.enableResultMerging = process.env.ENABLE_RESULT_MERGING === 'true';
}
if (process.env.RETRY_FAILED_TASKS) {
  config.retryFailedTasks = process.env.RETRY_FAILED_TASKS === 'true';
}
if (process.env.ENABLE_WEBSOCKET) {
  config.enableWebSocket = process.env.ENABLE_WEBSOCKET === 'true';
}
if (process.env.CORS_ORIGIN) {
  config.corsOrigin = process.env.CORS_ORIGIN.split(',');
}

// Set scheduler config
config.schedulerConfig = {
  maxConcurrentTasks: config.maxConcurrentTasks || 100,
  loadBalancingStrategy: 'capability-based',
  retryAttempts: config.retryFailedTasks ? 3 : 0
};

// Start the driver server
async function main() {
  try {
    console.log('Starting ClaudeCluster Driver...');
    console.log(`Configuration:`, {
      driverId: config.driverId || 'auto-generated',
      name: config.name || `Driver-${config.driverId || 'auto'}`,
      port: config.port || 3000,
      host: config.host || '0.0.0.0',
      maxConcurrentTasks: config.maxConcurrentTasks || 100,
      taskTimeout: (config.taskTimeout || 600000) / 1000 + 's',
      workerHealthInterval: (config.workerHealthCheckInterval || 30000) / 1000 + 's',
      taskDecomposition: config.enableTaskDecomposition !== false,
      resultMerging: config.enableResultMerging !== false,
      retryFailedTasks: config.retryFailedTasks !== false,
      webSocketEnabled: config.enableWebSocket !== false,
      corsOrigin: config.corsOrigin || 'any'
    });
    
    const driver = await startDriverServer(config);
    
    console.log(`✅ ClaudeCluster Driver started successfully!`);
    console.log(`   Driver ID: ${driver.id}`);
    console.log(`   Server URL: ${driver.getServerUrl()}`);
    console.log(`   Health Check: ${driver.getServerUrl()}/health`);
    console.log(`   API Documentation: ${driver.getServerUrl()}/docs (if enabled)`);
    console.log(`   WebSocket Endpoint: ws://${config.host === '0.0.0.0' ? 'localhost' : config.host}:${config.port}/ws/*`);
    console.log('');
    console.log('Driver is ready to accept tasks and manage workers. Press Ctrl+C to stop.');
    
    // Log initial stats
    const stats = driver.getStats();
    console.log(`   Initial Stats: ${stats.totalWorkers} workers, ${stats.totalTasks} tasks processed`);
    
    // Set up periodic stats logging
    setInterval(() => {
      const currentStats = driver.getStats();
      if (currentStats.totalTasks > stats.totalTasks) {
        console.log(`   📊 Stats Update: ${currentStats.totalTasks} total tasks, ${currentStats.completedTasks} completed, ${currentStats.runningTasks} running, ${currentStats.activeWorkers} active workers`);
      }
    }, 60000); // Log every minute if there's activity
    
  } catch (error) {
    console.error('❌ Failed to start ClaudeCluster Driver:', error);
    process.exit(1);
  }
}

main().catch((error) => {
  console.error('❌ Unexpected error:', error);
  process.exit(1);
});