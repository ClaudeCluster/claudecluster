/**
 * @fileoverview Claude Code process management with node-pty
 */

import { spawn } from 'node-pty';
import { EventEmitter } from 'events';
import { promises as fs } from 'fs';
import { join, resolve } from 'path';
import type { IPty } from 'node-pty';

/**
 * Claude Code process status
 */
export enum ClaudeProcessStatus {
  IDLE = 'idle',
  STARTING = 'starting',
  READY = 'ready',
  BUSY = 'busy',
  ERROR = 'error',
  TERMINATED = 'terminated'
}

/**
 * Claude Code process configuration
 */
export interface ClaudeProcessConfig {
  readonly claudeCodePath?: string; // Path to Claude Code executable
  readonly workspaceDir: string; // Working directory for tasks
  readonly tempDir: string; // Temporary directory for files
  readonly timeout: number; // Process timeout in milliseconds
  readonly maxMemoryMB: number; // Memory limit
  readonly environment?: Record<string, string>; // Environment variables
  readonly shell?: string; // Shell to use (default: system shell)
}

/**
 * Claude Code process output
 */
export interface ClaudeProcessOutput {
  readonly type: 'stdout' | 'stderr';
  readonly data: string;
  readonly timestamp: Date;
}

/**
 * Claude Code process execution result
 */
export interface ClaudeProcessResult {
  readonly exitCode: number;
  readonly output: readonly ClaudeProcessOutput[];
  readonly duration: number; // milliseconds
  readonly error?: string;
}

/**
 * Claude Code process events
 */
export interface ClaudeProcessEvents {
  status: (status: ClaudeProcessStatus) => void;
  output: (output: ClaudeProcessOutput) => void;
  ready: () => void;
  error: (error: Error) => void;
  exit: (exitCode: number) => void;
}

/**
 * Claude Code process manager
 */
export class ClaudeCodeProcess extends EventEmitter {
  private pty?: IPty;
  private status: ClaudeProcessStatus = ClaudeProcessStatus.IDLE;
  private outputBuffer: ClaudeProcessOutput[] = [];
  private startTime?: Date;
  private readyPromise?: Promise<void>;
  private readyResolve?: () => void;
  private readyReject?: (error: Error) => void;

  constructor(
    private config: ClaudeProcessConfig,
    private processId: string = `claude-${Date.now()}`
  ) {
    super();
    this.setupProcess();
  }

  /**
   * Set up the Claude Code process
   */
  private setupProcess(): void {
    this.setStatus(ClaudeProcessStatus.IDLE);
  }

  /**
   * Start the Claude Code process
   */
  async start(): Promise<void> {
    if (this.status !== ClaudeProcessStatus.IDLE) {
      throw new Error(`Cannot start process in ${this.status} status`);
    }

    this.setStatus(ClaudeProcessStatus.STARTING);
    this.outputBuffer = [];
    this.startTime = new Date();

    try {
      // Ensure directories exist
      await this.ensureDirectories();

      // Create ready promise
      this.readyPromise = new Promise((resolve, reject) => {
        this.readyResolve = resolve;
        this.readyReject = reject;
      });

      // Determine Claude Code command
      const claudeCommand = this.config.claudeCodePath || this.detectClaudeCodePath();
      
      // Spawn the process
      this.pty = spawn(claudeCommand, [], {
        cwd: this.config.workspaceDir,
        env: {
          ...process.env,
          ...this.config.environment
        },
        cols: 80,
        rows: 24
      });

      // Set up event handlers
      this.setupEventHandlers();

      // Wait for process to be ready
      await Promise.race([
        this.readyPromise,
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Process startup timeout')), 10000)
        )
      ]);

      this.setStatus(ClaudeProcessStatus.READY);
    } catch (error) {
      this.setStatus(ClaudeProcessStatus.ERROR);
      throw error instanceof Error ? error : new Error(String(error));
    }
  }

  /**
   * Stop the Claude Code process
   */
  async stop(): Promise<void> {
    if (!this.pty || this.status === ClaudeProcessStatus.TERMINATED) {
      return;
    }

    try {
      // Send termination signal
      this.pty.write('\x03'); // Ctrl+C
      await new Promise(resolve => setTimeout(resolve, 1000)); // Wait 1 second
      
      if (this.pty) {
        this.pty.kill('SIGTERM');
        await new Promise(resolve => setTimeout(resolve, 1000)); // Wait 1 second
        
        if (this.pty) {
          this.pty.kill('SIGKILL');
        }
      }
    } catch (error) {
      // Ignore errors during shutdown
    }
    
    this.setStatus(ClaudeProcessStatus.TERMINATED);
  }

  /**
   * Execute a command in the Claude Code process
   */
  async executeCommand(
    command: string,
    timeout: number = this.config.timeout
  ): Promise<ClaudeProcessResult> {
    if (this.status !== ClaudeProcessStatus.READY) {
      throw new Error(`Cannot execute command in ${this.status} status`);
    }

    this.setStatus(ClaudeProcessStatus.BUSY);
    const startTime = Date.now();
    const initialOutputLength = this.outputBuffer.length;

    try {
      // Send command to process
      if (this.pty) {
        this.pty.write(`${command}\n`);
      }

      // Wait for completion or timeout
      await new Promise((resolve, reject) => {
        const timeoutId = setTimeout(() => {
          reject(new Error(`Command execution timeout after ${timeout}ms`));
        }, timeout);

        // Monitor for completion indicators
        const checkCompletion = () => {
          const recentOutput = this.outputBuffer.slice(initialOutputLength);
          const lastOutput = recentOutput[recentOutput.length - 1];
          
          // Simple completion detection (can be enhanced)
          if (lastOutput && (
            lastOutput.data.includes('$') || 
            lastOutput.data.includes('>') ||
            lastOutput.data.includes('claude>')
          )) {
            clearTimeout(timeoutId);
            resolve(void 0);
          } else {
            setTimeout(checkCompletion, 100);
          }
        };

        setTimeout(checkCompletion, 100);
      });

      const duration = Date.now() - startTime;
      const commandOutput = this.outputBuffer.slice(initialOutputLength);

      this.setStatus(ClaudeProcessStatus.READY);

      return {
        exitCode: 0,
        output: commandOutput,
        duration
      };
    } catch (error) {
      this.setStatus(ClaudeProcessStatus.ERROR);
      
      const duration = Date.now() - startTime;
      const commandOutput = this.outputBuffer.slice(initialOutputLength);

      return {
        exitCode: 1,
        output: commandOutput,
        duration,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  /**
   * Write data directly to the process
   */
  write(data: string): void {
    if (this.pty && this.status === ClaudeProcessStatus.READY) {
      this.pty.write(data);
    } else {
      throw new Error(`Cannot write to process in ${this.status} status`);
    }
  }

  /**
   * Get current process status
   */
  getStatus(): ClaudeProcessStatus {
    return this.status;
  }

  /**
   * Get process output buffer
   */
  getOutput(): readonly ClaudeProcessOutput[] {
    return [...this.outputBuffer];
  }

  /**
   * Clear output buffer
   */
  clearOutput(): void {
    this.outputBuffer = [];
  }

  /**
   * Get process uptime in milliseconds
   */
  getUptime(): number {
    if (!this.startTime) return 0;
    return Date.now() - this.startTime.getTime();
  }

  /**
   * Check if process is healthy
   */
  isHealthy(): boolean {
    return this.status === ClaudeProcessStatus.READY || this.status === ClaudeProcessStatus.BUSY;
  }

  /**
   * Set process status and emit event
   */
  private setStatus(status: ClaudeProcessStatus): void {
    if (this.status !== status) {
      this.status = status;
      this.emit('status', status);
      
      if (status === ClaudeProcessStatus.READY) {
        this.emit('ready');
        this.readyResolve?.();
      }
    }
  }

  /**
   * Set up process event handlers
   */
  private setupEventHandlers(): void {
    if (!this.pty) return;

    // Handle process output
    this.pty.onData((data: string) => {
      const output: ClaudeProcessOutput = {
        type: 'stdout',
        data,
        timestamp: new Date()
      };
      
      this.outputBuffer.push(output);
      this.emit('output', output);
      
      // Check for ready indicators
      if (this.status === ClaudeProcessStatus.STARTING) {
        if (data.includes('$') || data.includes('>') || data.includes('claude>')) {
          this.setStatus(ClaudeProcessStatus.READY);
        }
      }
    });

    // Handle process exit
    this.pty.onExit(({ exitCode, signal }) => {
      this.setStatus(ClaudeProcessStatus.TERMINATED);
      this.emit('exit', exitCode);
      
      if (this.status === ClaudeProcessStatus.STARTING) {
        this.readyReject?.(new Error(`Process exited during startup with code ${exitCode}`));
      }
    });
  }

  /**
   * Ensure required directories exist
   */
  private async ensureDirectories(): Promise<void> {
    await fs.mkdir(resolve(this.config.workspaceDir), { recursive: true });
    await fs.mkdir(resolve(this.config.tempDir), { recursive: true });
  }

  /**
   * Detect Claude Code executable path
   */
  private detectClaudeCodePath(): string {
    // Try common Claude Code installation paths
    const possiblePaths = [
      'claude',
      'claude-code',
      '/usr/local/bin/claude',
      '/opt/claude/bin/claude',
      join(process.env.HOME || process.cwd(), '.local', 'bin', 'claude')
    ];

    // For now, return a default path
    // In a real implementation, we would check which path exists
    return possiblePaths[0] || 'claude';
  }
}

/**
 * Claude Code process pool for managing multiple processes
 */
export class ClaudeProcessPool extends EventEmitter {
  private processes = new Map<string, ClaudeCodeProcess>();
  private availableProcesses = new Set<string>();
  private busyProcesses = new Set<string>();

  constructor(
    private config: ClaudeProcessConfig,
    private maxProcesses: number = 5
  ) {
    super();
  }

  /**
   * Get or create an available process
   */
  async getProcess(): Promise<ClaudeCodeProcess> {
    // Check for available processes
    if (this.availableProcesses.size > 0) {
      const processId = this.availableProcesses.values().next().value as string;
      const process = this.processes.get(processId);
      if (!process) {
        throw new Error(`Process not found: ${processId}`);
      }
      
      this.availableProcesses.delete(processId);
      this.busyProcesses.add(processId);
      
      return process;
    }

    // Create new process if under limit
    if (this.processes.size < this.maxProcesses) {
      const processId = `claude-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
      const process = new ClaudeCodeProcess(this.config, processId);
      
      // Set up process event handlers
      process.on('status', (status: any) => {
        if (status === ClaudeProcessStatus.READY && this.busyProcesses.has(processId)) {
          this.busyProcesses.delete(processId);
          this.availableProcesses.add(processId);
        }
      });
      
      process.on('exit', () => {
        this.processes.delete(processId);
        this.availableProcesses.delete(processId);
        this.busyProcesses.delete(processId);
      });

      await process.start();
      this.processes.set(processId, process);
      this.busyProcesses.add(processId);
      
      return process;
    }

    // Wait for a process to become available
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('No processes available within timeout'));
      }, 30000);

      const checkAvailable = () => {
        if (this.availableProcesses.size > 0) {
          clearTimeout(timeout);
          this.getProcess().then(resolve).catch(reject);
        } else {
          setTimeout(checkAvailable, 100);
        }
      };

      checkAvailable();
    });
  }

  /**
   * Release a process back to the pool
   */
  releaseProcess(process: ClaudeCodeProcess): void {
    const processId = Array.from(this.processes.entries())
      .find(([_, p]) => p === process)?.[0];
    
    if (processId && this.busyProcesses.has(processId)) {
      this.busyProcesses.delete(processId);
      this.availableProcesses.add(processId);
    }
  }

  /**
   * Get pool statistics
   */
  getStats(): {
    total: number;
    available: number;
    busy: number;
  } {
    return {
      total: this.processes.size,
      available: this.availableProcesses.size,
      busy: this.busyProcesses.size
    };
  }

  /**
   * Shutdown all processes in the pool
   */
  async shutdown(): Promise<void> {
    const shutdownPromises = Array.from(this.processes.values())
      .map(process => process.stop());
    
    await Promise.all(shutdownPromises);
    
    this.processes.clear();
    this.availableProcesses.clear();
    this.busyProcesses.clear();
  }
}