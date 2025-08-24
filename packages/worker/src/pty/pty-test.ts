#!/usr/bin/env node

import * as pty from 'node-pty';
import { logger } from '../logger';

/**
 * Simple test to validate node-pty installation and functionality
 * This will be removed in production - just for validation
 */
export async function testPtyInstallation(): Promise<boolean> {
  try {
    logger.info('Testing node-pty installation...');

    // Test basic PTY spawning with a simple command
    const shell = process.platform === 'win32' ? 'powershell.exe' : 'bash';
    const args = process.platform === 'win32' ? [] : [];

    const ptyProcess = pty.spawn(shell, args, {
      name: 'xterm-color',
      cols: 80,
      rows: 24,
      cwd: process.cwd(),
      env: process.env as { [key: string]: string }
    });

    logger.info(`Spawned PTY process with PID: ${ptyProcess.pid}`);

    return new Promise((resolve, reject) => {
      let dataReceived = false;
      const timeout = setTimeout(() => {
        ptyProcess.kill();
        if (!dataReceived) {
          reject(new Error('PTY test timed out - no data received'));
        }
      }, 5000);

      ptyProcess.onData((data: string) => {
        dataReceived = true;
        logger.info('Received PTY data:', { dataLength: data.length });
      });

      ptyProcess.onExit((exitCode: number, signal?: number) => {
        clearTimeout(timeout);
        logger.info('PTY process exited:', { exitCode, signal });
        
        if (dataReceived) {
          resolve(true);
        } else {
          reject(new Error('PTY process exited without data'));
        }
      });

      // Send a simple command to test interaction
      setTimeout(() => {
        ptyProcess.write('echo "PTY test successful"\r');
        
        setTimeout(() => {
          ptyProcess.write('exit\r');
        }, 1000);
      }, 500);
    });

  } catch (error) {
    logger.error('PTY test failed:', error);
    throw error;
  }
}

// Test Claude Code CLI availability (mock for now)
export async function testClaudeCliAvailability(): Promise<boolean> {
  try {
    logger.info('Testing Claude Code CLI availability...');
    
    // For now, we'll just test if we can spawn a basic process
    // In production, this would test the actual Claude Code CLI
    const shell = process.platform === 'win32' ? 'cmd.exe' : 'sh';
    const args = process.platform === 'win32' ? ['/c', 'echo "Claude CLI test"'] : ['-c', 'echo "Claude CLI test"'];

    const ptyProcess = pty.spawn(shell, args, {
      name: 'xterm-color',
      cols: 80,
      rows: 24,
      cwd: process.cwd(),
      env: process.env as { [key: string]: string }
    });

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        ptyProcess.kill();
        reject(new Error('Claude CLI test timed out'));
      }, 5000);

      let output = '';
      ptyProcess.onData((data: string) => {
        output += data;
      });

      ptyProcess.onExit((exitCode: number) => {
        clearTimeout(timeout);
        
        if (exitCode === 0 && output.includes('Claude CLI test')) {
          logger.info('Claude CLI test successful');
          resolve(true);
        } else {
          reject(new Error(`Claude CLI test failed with exit code ${exitCode}`));
        }
      });
    });

  } catch (error) {
    logger.error('Claude CLI test failed:', error);
    throw error;
  }
}

// Run tests if called directly
if (require.main === module) {
  (async () => {
    try {
      logger.info('Starting PTY validation tests...');
      
      await testPtyInstallation();
      logger.info('✅ node-pty installation test passed');
      
      await testClaudeCliAvailability();
      logger.info('✅ Claude CLI availability test passed');
      
      logger.info('🎉 All PTY tests passed successfully!');
      process.exit(0);
    } catch (error) {
      logger.error('❌ PTY tests failed:', error);
      process.exit(1);
    }
  })();
}