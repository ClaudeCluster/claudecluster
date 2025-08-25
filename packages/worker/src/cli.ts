#!/usr/bin/env node

/**
 * @fileoverview CLI entry point for ClaudeCluster Worker
 */

import { startWorkerServer, type WorkerConfig } from './worker.js';

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
    
    case '--worker-id':
    case '-w':
      if (nextArg) {
        config.workerId = nextArg;
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
    
    case '--workspace-dir':
      if (nextArg) {
        config.processConfig = {
          ...config.processConfig,
          workspaceDir: nextArg
        };
        i++;
      }
      break;
    
    case '--temp-dir':
      if (nextArg) {
        config.processConfig = {
          ...config.processConfig,
          tempDir: nextArg
        };
        i++;
      }
      break;
    
    case '--timeout':
      if (nextArg && !isNaN(Number(nextArg))) {
        config.processConfig = {
          ...config.processConfig,
          timeout: Number(nextArg) * 1000 // Convert seconds to milliseconds
        };
        i++;
      }
      break;
    
    case '--memory':
      if (nextArg && !isNaN(Number(nextArg))) {
        config.processConfig = {
          ...config.processConfig,
          maxMemoryMB: Number(nextArg)
        };
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
      if (arg && arg.startsWith('-')) {
        console.error(`Unknown option: ${arg}`);
        showHelp();
        process.exit(1);
      }
      break;
  }
}

function showHelp() {
  console.log(`
ClaudeCluster Worker v0.1.0

USAGE:
  claudecluster-worker [OPTIONS]

OPTIONS:
  -p, --port <number>         Port to listen on (default: 3001)
  -h, --host <string>         Host to bind to (default: 0.0.0.0)
  -w, --worker-id <string>    Unique worker ID (default: auto-generated)
  -n, --name <string>         Worker display name
  -m, --max-tasks <number>    Maximum concurrent tasks (default: 5)
  
  --workspace-dir <path>      Workspace directory (default: ./workspace)
  --temp-dir <path>          Temporary directory (default: ./temp)
  --timeout <seconds>        Task timeout in seconds (default: 300)
  --memory <mb>              Memory limit in MB (default: 512)
  
  --help                     Show this help message
  --version                  Show version number

EXAMPLES:
  claudecluster-worker --port 3001 --max-tasks 10
  claudecluster-worker --worker-id my-worker --name "My Worker"
  claudecluster-worker --timeout 600 --memory 1024

ENVIRONMENT VARIABLES:
  WORKER_PORT               Port to listen on
  WORKER_HOST               Host to bind to
  WORKER_ID                 Worker ID
  WORKER_NAME               Worker display name
  WORKER_MAX_TASKS          Maximum concurrent tasks
  WORKSPACE_DIR             Workspace directory
  TEMP_DIR                  Temporary directory
  TASK_TIMEOUT              Task timeout in seconds
  MEMORY_LIMIT_MB           Memory limit in MB
  NODE_ENV                  Environment (development/production)

For more information, visit: https://github.com/claudecluster/claudecluster
`);
}

// Apply environment variables
if (process.env.WORKER_PORT) {
  config.port = Number(process.env.WORKER_PORT);
}
if (process.env.WORKER_HOST) {
  config.host = process.env.WORKER_HOST;
}
if (process.env.WORKER_ID) {
  config.workerId = process.env.WORKER_ID;
}
if (process.env.WORKER_NAME) {
  config.name = process.env.WORKER_NAME;
}
if (process.env.WORKER_MAX_TASKS) {
  config.maxConcurrentTasks = Number(process.env.WORKER_MAX_TASKS);
}
if (process.env.WORKSPACE_DIR) {
  config.processConfig = {
    ...config.processConfig,
    workspaceDir: process.env.WORKSPACE_DIR
  };
}
if (process.env.TEMP_DIR) {
  config.processConfig = {
    ...config.processConfig,
    tempDir: process.env.TEMP_DIR
  };
}
if (process.env.TASK_TIMEOUT) {
  config.processConfig = {
    ...config.processConfig,
    timeout: Number(process.env.TASK_TIMEOUT) * 1000
  };
}
if (process.env.MEMORY_LIMIT_MB) {
  config.processConfig = {
    ...config.processConfig,
    maxMemoryMB: Number(process.env.MEMORY_LIMIT_MB)
  };
}

// Set defaults if not provided
config.processConfig = {
  workspaceDir: './workspace',
  tempDir: './temp',
  timeout: 300000,
  maxMemoryMB: 512,
  environment: {},
  ...config.processConfig
};

// Start the worker server
async function main() {
  try {
    console.log('Starting ClaudeCluster Worker...');
    console.log(`Configuration:`, {
      workerId: config.workerId || 'auto-generated',
      name: config.name || `Worker-${config.workerId || 'auto'}`,
      port: config.port || 3001,
      host: config.host || '0.0.0.0',
      maxConcurrentTasks: config.maxConcurrentTasks || 5,
      workspaceDir: config.processConfig?.workspaceDir,
      tempDir: config.processConfig?.tempDir,
      timeout: (config.processConfig?.timeout || 300000) / 1000 + 's',
      memoryLimit: (config.processConfig?.maxMemoryMB || 512) + 'MB'
    });
    
    const worker = await startWorkerServer(config);
    
    console.log(`✅ ClaudeCluster Worker started successfully!`);
    console.log(`   Worker ID: ${worker.id}`);
    console.log(`   Server URL: ${worker.getServerUrl()}`);
    console.log(`   Health Check: ${worker.getServerUrl()}/health`);
    console.log(`   Status: ${worker.getServerUrl()}/status`);
    console.log('');
    console.log('Worker is ready to accept tasks. Press Ctrl+C to stop.');
  } catch (error) {
    console.error('❌ Failed to start ClaudeCluster Worker:', error);
    process.exit(1);
  }
}

main().catch((error) => {
  console.error('❌ Unexpected error:', error);
  process.exit(1);
});