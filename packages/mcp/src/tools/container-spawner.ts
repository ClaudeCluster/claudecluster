/**
 * @fileoverview Container Spawner Tool for MCP Container Prototype
 * 
 * This tool implements the core functionality for spawning and managing
 * Docker containers running Claude Code for agentic mode execution.
 */

import { EventEmitter } from 'events';
import Docker from 'dockerode';
import type { Container, ContainerCreateOptions, ContainerInfo } from 'dockerode';
import { v4 as uuidv4 } from 'uuid';
import { z } from 'zod';
import type { Logger } from 'pino';

/**
 * Container session configuration
 */
export interface ContainerSessionConfig {
  sessionId: string;
  task: string;
  repoUrl?: string;
  timeout?: number;
  resourceLimits?: ResourceLimits;
  environment?: Record<string, string>;
}

/**
 * Resource limits for containers
 */
export interface ResourceLimits {
  memory?: number; // in bytes
  cpu?: number; // CPU shares
  diskSize?: number; // in bytes
}

/**
 * Container execution result
 */
export interface ContainerExecutionResult {
  sessionId: string;
  containerId: string;
  exitCode: number;
  stdout: string;
  stderr: string;
  error?: string;
  duration: number;
  resourceUsage?: {
    memory: number;
    cpu: number;
  };
}

/**
 * Container spawner events
 */
export interface ContainerSpawnerEvents {
  'container-created': (sessionId: string, containerId: string) => void;
  'container-started': (sessionId: string, containerId: string) => void;
  'container-stopped': (sessionId: string, containerId: string, exitCode: number) => void;
  'container-removed': (sessionId: string, containerId: string) => void;
  'container-error': (sessionId: string, containerId: string, error: Error) => void;
  'execution-complete': (sessionId: string, result: ContainerExecutionResult) => void;
}

/**
 * Configuration schema for tool parameters
 */
export const ContainerSpawnerParamsSchema = z.object({
  task: z.string().min(1, 'Task description is required'),
  repoUrl: z.string().url().optional(),
  sessionTimeout: z.number().min(30).max(3600).default(300), // 5 minutes default, max 1 hour
  resourceLimits: z.object({
    memory: z.number().positive().default(2 * 1024 * 1024 * 1024), // 2GB default
    cpu: z.number().positive().default(1024), // 1024 CPU shares default
    diskSize: z.number().positive().optional()
  }).optional(),
  environment: z.record(z.string()).optional()
});

export type ContainerSpawnerParams = z.infer<typeof ContainerSpawnerParamsSchema>;

/**
 * Container Spawner Tool
 * 
 * Manages the lifecycle of Docker containers for Claude Code execution
 */
export class ContainerSpawnerTool extends EventEmitter {
  private docker: Docker;
  private activeContainers = new Map<string, Container>();
  private sessionTimeouts = new Map<string, NodeJS.Timeout>();
  private logger: Logger;

  // Configuration
  private readonly baseImage = 'ghcr.io/anthropics/claude-code:latest';
  private readonly containerNamePrefix = 'claudecluster-session';
  private readonly networkName = 'claudecluster-network';
  private readonly workspaceDir = '/workspace';
  private readonly wrapperScript = '/usr/local/bin/claude-prototype-wrapper.sh';

  constructor(logger: Logger, dockerOptions?: Docker.DockerOptions) {
    super();
    this.logger = logger;
    this.docker = new Docker(dockerOptions || { socketPath: '/var/run/docker.sock' });
    
    // Set up cleanup on process exit
    process.on('SIGINT', () => this.cleanup());
    process.on('SIGTERM', () => this.cleanup());
    process.on('exit', () => this.cleanup());
  }

  /**
   * Execute a task in a new container
   */
  async execute(params: ContainerSpawnerParams): Promise<ContainerExecutionResult> {
    const validatedParams = ContainerSpawnerParamsSchema.parse(params);
    const sessionId = uuidv4();
    const startTime = Date.now();

    this.logger.info({ sessionId, task: validatedParams.task }, 'Starting container execution');

    try {
      // 1. Ensure base image is available
      await this.ensureBaseImage();

      // 2. Create and start container
      const container = await this.createContainer(sessionId, validatedParams);
      await this.startContainer(sessionId, container);

      // 3. Set up timeout
      this.setupTimeout(sessionId, container, validatedParams.sessionTimeout);

      // 4. Execute task and capture output
      const result = await this.executeInContainer(sessionId, container, validatedParams);

      // 5. Clean up container
      await this.cleanupContainer(sessionId);

      const duration = Date.now() - startTime;
      const executionResult: ContainerExecutionResult = {
        ...result,
        sessionId,
        duration
      };

      this.emit('execution-complete', sessionId, executionResult);
      return executionResult;

    } catch (error) {
      this.logger.error({ sessionId, error }, 'Container execution failed');
      await this.cleanupContainer(sessionId);
      
      throw error;
    }
  }

  /**
   * Ensure the base Claude Code image is available
   */
  private async ensureBaseImage(): Promise<void> {
    try {
      await this.docker.getImage(this.baseImage).inspect();
      this.logger.debug({ image: this.baseImage }, 'Base image available locally');
    } catch (error) {
      this.logger.info({ image: this.baseImage }, 'Pulling base image');
      await this.pullImage(this.baseImage);
    }
  }

  /**
   * Pull Docker image
   */
  private async pullImage(imageName: string): Promise<void> {
    return new Promise((resolve, reject) => {
      this.docker.pull(imageName, (err: Error | null, stream: NodeJS.ReadableStream | null) => {
        if (err) return reject(err);
        if (!stream) return reject(new Error('No stream returned from pull'));

        this.docker.modem.followProgress(stream, (err: Error | null) => {
          if (err) return reject(err);
          this.logger.info({ image: imageName }, 'Image pulled successfully');
          resolve();
        });
      });
    });
  }

  /**
   * Create a new container
   */
  private async createContainer(
    sessionId: string, 
    params: ContainerSpawnerParams
  ): Promise<Container> {
    const containerName = `${this.containerNamePrefix}-${sessionId}`;
    
    const createOptions: ContainerCreateOptions = {
      Image: this.baseImage,
      name: containerName,
      Labels: {
        'mcp.session': sessionId,
        'mcp.type': 'claude-code-session',
        'mcp.created': new Date().toISOString()
      },
      Env: [
        `SESSION_ID=${sessionId}`,
        `TASK=${params.task}`,
        `REPO_URL=${params.repoUrl || ''}`,
        `CLAUDE_API_KEY=${process.env['CLAUDE_API_KEY'] || ''}`,
        `WORKSPACE_DIR=${this.workspaceDir}`,
        // Add custom environment variables
        ...Object.entries(params.environment || {}).map(([key, value]) => `${key}=${value}`)
      ],
      WorkingDir: this.workspaceDir,
      User: 'node', // Run as non-root user from base image
      Cmd: [this.wrapperScript],
      HostConfig: {
        // Resource limits
        Memory: params.resourceLimits?.memory || 2 * 1024 * 1024 * 1024, // 2GB
        CpuShares: params.resourceLimits?.cpu || 1024,
        
        // Security settings
        AutoRemove: true, // Automatically remove container when stopped
        NetworkMode: 'bridge', // Isolated network
        SecurityOpt: ['no-new-privileges:true'],
        CapDrop: ['ALL'], // Drop all capabilities for security
        ReadonlyRootfs: false, // Allow writes to filesystem for code generation
        
        // Prevent container from accessing host Docker
        Binds: [], // No host mounts for security
        
        // Resource monitoring
        OomKillDisable: false, // Allow OOM killer to work
        
        // Logging
        LogConfig: {
          Type: 'json-file',
          Config: {
            'max-size': '10m',
            'max-file': '3'
          }
        }
      },
      
      // Health check
      Healthcheck: {
        Test: ['CMD-SHELL', 'ps aux | grep -v grep | grep -q claude-code || exit 1'],
        Interval: 30 * 1000000000, // 30 seconds in nanoseconds
        Timeout: 10 * 1000000000,  // 10 seconds in nanoseconds
        Retries: 3,
        StartPeriod: 5 * 1000000000 // 5 seconds in nanoseconds
      }
    };

    const container = await this.docker.createContainer(createOptions);
    this.activeContainers.set(sessionId, container);
    
    this.logger.info({ 
      sessionId, 
      containerId: container.id, 
      containerName 
    }, 'Container created');
    
    this.emit('container-created', sessionId, container.id);
    return container;
  }

  /**
   * Start a container
   */
  private async startContainer(sessionId: string, container: Container): Promise<void> {
    await container.start();
    
    this.logger.info({ sessionId, containerId: container.id }, 'Container started');
    this.emit('container-started', sessionId, container.id);
  }

  /**
   * Set up timeout for container execution
   */
  private setupTimeout(
    sessionId: string, 
    container: Container, 
    timeout: number
  ): void {
    const timeoutHandle = setTimeout(async () => {
      this.logger.warn({ sessionId, timeout }, 'Container execution timed out');
      
      try {
        await container.kill('SIGTERM');
        setTimeout(async () => {
          try {
            await container.kill('SIGKILL');
          } catch (error) {
            this.logger.error({ sessionId, error }, 'Failed to force kill container');
          }
        }, 10000); // Force kill after 10 seconds
      } catch (error) {
        this.logger.error({ sessionId, error }, 'Failed to kill timed out container');
      }
    }, timeout * 1000);

    this.sessionTimeouts.set(sessionId, timeoutHandle);
  }

  /**
   * Execute task in container and capture output
   */
  private async executeInContainer(
    sessionId: string,
    container: Container,
    params: ContainerSpawnerParams
  ): Promise<Omit<ContainerExecutionResult, 'sessionId' | 'duration'>> {
    return new Promise((resolve, reject) => {
      let stdout = '';
      let stderr = '';
      let completed = false;

      // Attach to container to capture output
      const attachOptions = {
        stream: true,
        stdout: true,
        stderr: true,
        logs: true
      };

      container.attach(attachOptions, (err, stream) => {
        if (err) return reject(err);
        if (!stream) return reject(new Error('No stream returned from attach'));

        // Demultiplex the stream
        const stdoutStream = new (require('stream').PassThrough)();
        const stderrStream = new (require('stream').PassThrough)();
        
        container.modem.demuxStream(stream, stdoutStream, stderrStream);

        // Capture stdout
        stdoutStream.on('data', (chunk: Buffer) => {
          stdout += chunk.toString();
        });

        // Capture stderr  
        stderrStream.on('data', (chunk: Buffer) => {
          stderr += chunk.toString();
        });

        // Handle container completion
        const handleCompletion = async () => {
          if (completed) return;
          completed = true;

          try {
            const containerInfo = await container.inspect();
            const exitCode = containerInfo.State.ExitCode || 0;

            this.logger.info({ 
              sessionId, 
              exitCode, 
              stdoutLength: stdout.length,
              stderrLength: stderr.length 
            }, 'Container execution completed');

            this.emit('container-stopped', sessionId, container.id, exitCode);

            resolve({
              containerId: container.id,
              exitCode,
              stdout: stdout.trim(),
              stderr: stderr.trim(),
              resourceUsage: {
                memory: containerInfo.HostConfig?.Memory || 0,
                cpu: containerInfo.HostConfig?.CpuShares || 0
              }
            });
          } catch (inspectError) {
            this.logger.error({ sessionId, error: inspectError }, 'Failed to inspect container after completion');
            reject(inspectError);
          }
        };

        // Wait for container to complete
        container.wait((waitErr, data) => {
          if (waitErr) {
            this.logger.error({ sessionId, error: waitErr }, 'Container wait failed');
            return reject(waitErr);
          }
          
          // Small delay to ensure all output is captured
          setTimeout(handleCompletion, 100);
        });
      });
    });
  }

  /**
   * Clean up container and associated resources
   */
  private async cleanupContainer(sessionId: string): Promise<void> {
    const container = this.activeContainers.get(sessionId);
    const timeout = this.sessionTimeouts.get(sessionId);

    // Clear timeout
    if (timeout) {
      clearTimeout(timeout);
      this.sessionTimeouts.delete(sessionId);
    }

    if (!container) {
      this.logger.warn({ sessionId }, 'No container found for cleanup');
      return;
    }

    try {
      // Container should auto-remove due to AutoRemove: true
      // But we'll attempt manual cleanup as backup
      try {
        await container.remove({ force: true });
        this.logger.info({ sessionId, containerId: container.id }, 'Container removed');
      } catch (removeError) {
        // Container might already be removed due to AutoRemove
        this.logger.debug({ sessionId, error: removeError }, 'Container removal failed (likely already removed)');
      }

      this.activeContainers.delete(sessionId);
      this.emit('container-removed', sessionId, container.id);

    } catch (error) {
      this.logger.error({ sessionId, error }, 'Failed to cleanup container');
      this.emit('container-error', sessionId, container.id, error as Error);
    }
  }

  /**
   * Clean up all active containers
   */
  async cleanup(): Promise<void> {
    this.logger.info({ activeContainers: this.activeContainers.size }, 'Cleaning up all containers');

    const cleanupPromises = Array.from(this.activeContainers.keys()).map(sessionId =>
      this.cleanupContainer(sessionId).catch(error => 
        this.logger.error({ sessionId, error }, 'Failed to cleanup container during shutdown')
      )
    );

    await Promise.allSettled(cleanupPromises);
    this.logger.info('Container cleanup completed');
  }

  /**
   * Get status of all active containers
   */
  async getActiveContainers(): Promise<Array<{ sessionId: string; containerId: string; status: string }>> {
    const statuses = [];

    for (const [sessionId, container] of this.activeContainers.entries()) {
      try {
        const info = await container.inspect();
        statuses.push({
          sessionId,
          containerId: container.id,
          status: info.State.Status || 'unknown'
        });
      } catch (error) {
        this.logger.warn({ sessionId, error }, 'Failed to get container status');
      }
    }

    return statuses;
  }

  /**
   * Get Docker system info
   */
  async getSystemInfo(): Promise<any> {
    try {
      return await this.docker.info();
    } catch (error) {
      this.logger.error({ error }, 'Failed to get Docker system info');
      throw error;
    }
  }
}

/**
 * MCP Tool interface implementation
 */
export interface MCPTool {
  name: string;
  description: string;
  execute(params: any): Promise<any>;
}

/**
 * MCP Container Spawner Tool wrapper
 */
export class MCPContainerSpawnerTool implements MCPTool {
  name = 'spawn_claude_container';
  description = 'Spawn a Claude Code container for task execution with session isolation';

  private spawner: ContainerSpawnerTool;

  constructor(logger: Logger, dockerOptions?: Docker.DockerOptions) {
    this.spawner = new ContainerSpawnerTool(logger, dockerOptions);
  }

  async execute(params: ContainerSpawnerParams): Promise<ContainerExecutionResult> {
    return await this.spawner.execute(params);
  }

  /**
   * Get spawner instance for event handling
   */
  getSpawner(): ContainerSpawnerTool {
    return this.spawner;
  }

  /**
   * Clean up all resources
   */
  async cleanup(): Promise<void> {
    return await this.spawner.cleanup();
  }
}

export default MCPContainerSpawnerTool;