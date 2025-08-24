#!/usr/bin/env node

import { ClaudeWorker } from './index';
import { logger } from './logger';

async function main() {
  const worker = new ClaudeWorker(
    process.env.WORKER_ID || 'worker-1',
    process.env.WORKER_NAME || 'ClaudeWorker-1',
    ['general', 'coding']
  );

  // Handle graceful shutdown
  const shutdown = async () => {
    logger.info('Received shutdown signal');
    await worker.stop();
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  try {
    await worker.start();
  } catch (error) {
    logger.error('Failed to start worker:', error);
    process.exit(1);
  }
}

// Start the worker if this file is run directly
if (require.main === module) {
  main().catch((error) => {
    logger.error('Unhandled error:', error);
    process.exit(1);
  });
}

export { main };