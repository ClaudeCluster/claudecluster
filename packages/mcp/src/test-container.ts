#!/usr/bin/env node
/**
 * @fileoverview Test script for MCP Container Spawner Tool
 * 
 * This script tests the container spawning functionality end-to-end
 */

import { ContainerServer } from './server/container-server.js';
import { MCPContainerSpawnerTool } from './tools/container-spawner.js';
import { pino } from 'pino';

const logger = pino({
  level: 'debug',
  transport: {
    target: 'pino-pretty',
    options: {
      colorize: true
    }
  }
});

async function testContainerSpawning() {
  logger.info('Starting Container Spawner Test');

  // Test 1: Direct tool usage
  logger.info('Test 1: Direct Container Spawner Tool');
  
  const containerTool = new MCPContainerSpawnerTool(logger);
  
  try {
    const result = await containerTool.execute({
      task: 'echo "Hello from ClaudeCluster container!"',
      sessionTimeout: 30 // 30 seconds timeout for testing
    });
    
    logger.info({ result }, 'Container execution completed successfully');
    
    if (result.exitCode === 0) {
      logger.info('✅ Direct container spawning test passed');
    } else {
      logger.error('❌ Direct container spawning test failed');
    }
    
  } catch (error) {
    logger.error({ error }, '❌ Direct container spawning test failed with error');
  }

  // Test 2: Server-based usage
  logger.info('Test 2: Container Server API');
  
  const server = new ContainerServer({
    host: 'localhost',
    port: 3199 // Different port to avoid conflicts
  });
  
  try {
    await server.start();
    logger.info('Container server started');
    
    // Test HTTP API
    const response = await fetch('http://localhost:3199/container/spawn', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        task: 'echo "Hello from ClaudeCluster HTTP API!"',
        sessionTimeout: 30
      })
    });
    
    const data = await response.json();
    logger.info({ data }, 'HTTP API response received');
    
    if (data.success && data.data.exitCode === 0) {
      logger.info('✅ HTTP API container spawning test passed');
    } else {
      logger.error('❌ HTTP API container spawning test failed');
    }
    
    // Test Docker info endpoint
    const infoResponse = await fetch('http://localhost:3199/container/docker-info');
    const infoData = await infoResponse.json();
    
    if (infoData.success) {
      logger.info('✅ Docker info endpoint test passed');
    } else {
      logger.error('❌ Docker info endpoint test failed');
    }
    
  } catch (error) {
    logger.error({ error }, '❌ Server-based test failed with error');
  } finally {
    await server.stop();
    logger.info('Container server stopped');
  }
  
  // Cleanup
  await containerTool.cleanup();
  logger.info('Container spawner cleanup completed');
  
  logger.info('All container spawning tests completed');
}

// Run tests
testContainerSpawning().catch((error) => {
  logger.error({ error }, 'Test execution failed');
  process.exit(1);
});