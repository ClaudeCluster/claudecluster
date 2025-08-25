/**
 * @fileoverview Container Provider Implementation
 * 
 * Implements the ExecutionProvider interface for container-based execution
 * using Docker and the official Anthropic Claude Code image.
 */

import { v4 as uuidv4 } from 'uuid';
import Docker from 'dockerode';
import type { Container, ContainerCreateOptions } from 'dockerode';
import {
  BaseProvider,
  type ExecutionProvider,
  type Executor,
  ExecutionMode,
  ExecutorState,
  type ExecutorStatus,
  ExecutorError,
  ErrorCodes
} from './provider.js';
import type { Task, TaskResult, WorkerConfig } from '@claudecluster/core';

/**
 * Container Executor implementation
 * 
 * Wraps Docker container to implement the Executor interface
 */
export class ContainerExecutor implements Executor {
  private readonly id: string;
  private state: ExecutorState = ExecutorState.INITIALIZING;
  private currentTask?: string;
  private readonly startTime: Date;
  private tasksCompleted = 0;
  private lastActivity: Date;

  constructor(
    private container: Container,
    private docker: Docker,
    private sessionId: string,
    private containerProvider: ContainerProvider
  ) {
    this.id = uuidv4();
    this.startTime = new Date();
    this.lastActivity = new Date();
    
    // Initially set to idle after container is ready
    this.state = ExecutorState.IDLE;
  }

  /**
   * Execute a task in the container
   */
  async execute(task: Task): Promise<TaskResult> {
    if (this.state !== ExecutorState.IDLE) {
      throw new ExecutorError(
        `Cannot execute task in ${this.state} state`,
        ErrorCodes.EXECUTOR_EXECUTION_FAILED,
        this.id
      );
    }

    this.state = ExecutorState.EXECUTING;
    this.currentTask = task.id;
    this.lastActivity = new Date();
    const startTime = Date.now();

    try {
      // Prepare the task execution command
      const command = this.buildTaskCommand(task);
      
      // Execute the task in the container
      const exec = await this.container.exec({
        Cmd: ['bash', '-c', command],
        AttachStdout: true,
        AttachStderr: true,
        Tty: false
      });

      // Start execution and capture output
      const stream = await exec.start({ hijack: false, stdin: false });
      const { stdout, stderr } = await this.captureOutput(stream);
      
      // Get execution info
      const inspectResult = await exec.inspect();
      const exitCode = inspectResult.ExitCode || 0;
      const duration = Date.now() - startTime;

      // Create task result
      const taskResult: TaskResult = {
        id: uuidv4(),
        taskId: task.id,
        status: exitCode === 0 ? 'completed' : 'failed',
        result: {
          success: exitCode === 0,
          output: stdout,
          error: stderr || undefined,
          artifacts: await this.extractArtifacts(),
          metadata: {
            executionTime: duration,
            exitCode,
            sessionId: this.sessionId,
            containerId: this.container.id
          }
        },
        executionTime: duration,
        completedAt: new Date(),
        error: exitCode !== 0 ? new Error(stderr || 'Task execution failed') : undefined
      };

      this.state = ExecutorState.IDLE;
      this.currentTask = undefined;
      this.tasksCompleted++;
      this.lastActivity = new Date();

      return taskResult;

    } catch (error) {
      this.state = ExecutorState.ERROR;
      this.currentTask = undefined;
      this.lastActivity = new Date();

      throw new ExecutorError(
        `Container task execution failed: ${error instanceof Error ? error.message : String(error)}`,
        ErrorCodes.EXECUTOR_EXECUTION_FAILED,
        this.id,
        error instanceof Error ? error : new Error(String(error))
      );
    }
  }

  /**
   * Terminate the container executor
   */
  async terminate(): Promise<void> {
    if (this.state === ExecutorState.TERMINATED) {
      return;
    }

    this.state = ExecutorState.TERMINATING;
    this.lastActivity = new Date();

    try {
      // Stop the container gracefully
      await this.container.stop({ t: 10 }); // 10 second timeout
      
      // The container should auto-remove due to AutoRemove: true
      // But we'll verify it's cleaned up
      try {
        await this.container.inspect();
        // If we can still inspect it, force remove
        await this.container.remove({ force: true });
      } catch {
        // Container already removed, which is expected
      }

      this.state = ExecutorState.TERMINATED;
      
    } catch (error) {
      this.state = ExecutorState.ERROR;
      throw new ExecutorError(
        `Failed to terminate container: ${error instanceof Error ? error.message : String(error)}`,
        ErrorCodes.EXECUTOR_TERMINATION_FAILED,
        this.id,
        error instanceof Error ? error : new Error(String(error))
      );
    }
  }

  /**
   * Check if the container executor is healthy
   */
  isHealthy(): boolean {
    if (this.state === ExecutorState.ERROR || this.state === ExecutorState.TERMINATED) {
      return false;
    }

    // Check if container is still running
    return this.checkContainerHealth().catch(() => false);
  }

  /**
   * Get executor status
   */
  getStatus(): ExecutorStatus {
    const uptime = Date.now() - this.startTime.getTime();
    
    return {
      id: this.id,
      mode: ExecutionMode.CONTAINER_AGENTIC,
      state: this.state,
      currentTask: this.currentTask,
      uptime,
      tasksCompleted: this.tasksCompleted,
      lastActivity: this.lastActivity,
      resourceUsage: {
        memory: 0, // Would require container stats API call
        cpu: 0     // Would require container stats API call
      }
    };
  }

  /**
   * Build command to execute task in container
   */
  private buildTaskCommand(task: Task): string {
    // Build a comprehensive command that prepares the environment and executes the task
    const commands: string[] = [];
    
    // Set up environment
    commands.push('cd /workspace');
    
    // Clone repository if specified
    if (task.context?.repoUrl) {
      commands.push(`git clone "${task.context.repoUrl}" repo || true`);
      commands.push('cd repo || true');
    }
    
    // Set up Claude Code environment
    commands.push('export CLAUDE_CODE_SESSION_ID="${SESSION_ID}"');
    
    // Execute the main task
    // For the prototype, we'll use a simple echo and touch file approach
    // In real implementation, this would interface with Claude Code directly
    commands.push(`echo "Executing task: ${task.title}"`);
    commands.push(`echo "${task.description}" > task_description.txt`);
    
    // If the task has specific commands in context, execute them
    if (task.context?.commands && Array.isArray(task.context.commands)) {
      commands.push(...task.context.commands);
    } else {
      // Default behavior: create a completion marker
      commands.push(`echo "Task completed successfully" > task_completion.txt`);
      commands.push(`echo "Result: Task '${task.title}' has been processed"`);
    }
    
    // Join all commands with &&
    return commands.join(' && ');
  }

  /**
   * Capture output from container execution stream
   */
  private async captureOutput(stream: NodeJS.ReadableStream): Promise<{
    stdout: string;
    stderr: string;
  }> {
    return new Promise((resolve, reject) => {
      let stdout = '';
      let stderr = '';
      
      // Docker uses multiplexed streams
      // We need to demux the stream to separate stdout/stderr
      const stdoutStream = new (require('stream').PassThrough)();
      const stderrStream = new (require('stream').PassThrough)();
      
      this.docker.modem.demuxStream(stream, stdoutStream, stderrStream);
      
      stdoutStream.on('data', (chunk: Buffer) => {
        stdout += chunk.toString();
      });
      
      stderrStream.on('data', (chunk: Buffer) => {
        stderr += chunk.toString();
      });
      
      stream.on('end', () => {
        resolve({
          stdout: stdout.trim(),
          stderr: stderr.trim()
        });
      });
      
      stream.on('error', (error: Error) => {
        reject(error);
      });
    });
  }

  /**
   * Extract artifacts created during task execution
   */
  private async extractArtifacts(): Promise<Array<{ name: string; path: string; content?: string }>> {
    const artifacts: Array<{ name: string; path: string; content?: string }> = [];
    
    try {
      // List files in workspace to identify created artifacts
      const exec = await this.container.exec({
        Cmd: ['find', '/workspace', '-type', 'f', '-name', '*'],
        AttachStdout: true,
        AttachStderr: false
      });
      
      const stream = await exec.start({ hijack: false, stdin: false });
      const { stdout } = await this.captureOutput(stream);
      
      // Parse file list and add to artifacts
      const files = stdout.split('\n').filter(line => line.trim());
      for (const filePath of files) {
        if (filePath && !filePath.includes('.git/')) {
          artifacts.push({
            name: filePath.split('/').pop() || 'unknown',
            path: filePath
          });
        }
      }
      
    } catch (error) {
      // If we can't extract artifacts, that's not a critical failure
      console.warn('Failed to extract artifacts:', error);
    }
    
    return artifacts;
  }

  /**
   * Check container health
   */
  private async checkContainerHealth(): Promise<boolean> {
    try {
      const info = await this.container.inspect();
      return info.State.Running === true && info.State.Status === 'running';
    } catch {
      return false;
    }
  }

  /**
   * Get container instance for provider management
   */
  getContainer(): Container {
    return this.container;
  }

  /**
   * Get session ID
   */
  getSessionId(): string {
    return this.sessionId;
  }
}

/**
 * Container Provider implementation
 * 
 * Implements ExecutionProvider interface for container-based execution
 */
export class ContainerProvider extends BaseProvider {
  private docker: Docker;
  private activeExecutors = new Map<string, ContainerExecutor>();
  private readonly baseImage = 'ghcr.io/anthropics/claude-code:latest';

  constructor(config: WorkerConfig) {
    super(config);
    
    // Initialize Docker client
    this.docker = new Docker(
      config.container?.dockerOptions || { socketPath: '/var/run/docker.sock' }
    );
  }

  /**
   * Get an executor for task execution
   */
  async getExecutor(task: Task, mode: ExecutionMode): Promise<Executor> {
    if (mode !== ExecutionMode.CONTAINER_AGENTIC) {
      throw new Error(`ContainerProvider does not support mode: ${mode}`);
    }

    if (this.isShuttingDown) {
      throw new Error('Provider is shutting down');
    }

    try {
      // Ensure base image is available
      await this.ensureBaseImage();
      
      // Create session ID
      const sessionId = task.sessionId || uuidv4();
      
      // Create container
      const container = await this.createContainer(sessionId, task);
      
      // Start container
      await container.start();
      
      // Create executor wrapper
      const executor = new ContainerExecutor(container, this.docker, sessionId, this);
      
      // Track the executor
      this.activeExecutors.set(executor.getStatus().id, executor);
      
      return executor;

    } catch (error) {
      throw new ExecutorError(
        `Failed to create container executor: ${error instanceof Error ? error.message : String(error)}`,
        ErrorCodes.EXECUTOR_CREATION_FAILED,
        'unknown',
        error instanceof Error ? error : new Error(String(error))
      );
    }
  }

  /**
   * Release an executor back to the provider
   */
  async release(executor: Executor): Promise<void> {
    if (!(executor instanceof ContainerExecutor)) {
      throw new Error('Invalid executor type for ContainerProvider');
    }

    try {
      // Remove from active executors
      this.activeExecutors.delete(executor.getStatus().id);
      
      // Terminate the container
      await executor.terminate();
      
      // Call parent release method
      await super.release(executor);

    } catch (error) {
      throw new ExecutorError(
        `Failed to release container executor: ${error instanceof Error ? error.message : String(error)}`,
        ErrorCodes.EXECUTOR_TERMINATION_FAILED,
        executor.getStatus().id,
        error instanceof Error ? error : new Error(String(error))
      );
    }
  }

  /**
   * Clean up all resources
   */
  async cleanup(): Promise<void> {
    await super.cleanup();
    
    try {
      // Terminate all active executors
      const terminatePromises = Array.from(this.activeExecutors.values()).map(
        executor => executor.terminate().catch(error => 
          console.error('Failed to terminate container executor during cleanup:', error)
        )
      );
      
      await Promise.all(terminatePromises);
      this.activeExecutors.clear();

    } catch (error) {
      throw new ExecutorError(
        `Failed to cleanup container provider: ${error instanceof Error ? error.message : String(error)}`,
        ErrorCodes.PROVIDER_CLEANUP_FAILED,
        'provider',
        error instanceof Error ? error : new Error(String(error))
      );
    }
  }

  /**
   * Get the execution mode
   */
  getMode(): ExecutionMode {
    return ExecutionMode.CONTAINER_AGENTIC;
  }

  /**
   * Get total number of executors
   */
  protected getTotalExecutors(): number {
    return this.activeExecutors.size;
  }

  /**
   * Get number of active executors
   */
  protected getActiveExecutors(): number {
    return Array.from(this.activeExecutors.values()).filter(
      executor => executor.getStatus().state === ExecutorState.EXECUTING
    ).length;
  }

  /**
   * Get number of idle executors
   */
  protected getIdleExecutors(): number {
    return Array.from(this.activeExecutors.values()).filter(
      executor => executor.getStatus().state === ExecutorState.IDLE
    ).length;
  }

  /**
   * Get resource usage
   */
  protected getResourceUsage(): {
    totalMemory: number;
    usedMemory: number;
    totalCpu: number;
    usedCpu: number;
  } {
    const containerLimits = this.config.container?.resourceLimits;
    const maxContainers = this.config.container?.maxContainers || 10;
    
    return {
      totalMemory: maxContainers * (containerLimits?.memory || 4 * 1024 * 1024 * 1024), // 4GB default
      usedMemory: this.activeExecutors.size * (containerLimits?.memory || 4 * 1024 * 1024 * 1024),
      totalCpu: maxContainers * (containerLimits?.cpu || 1024), // 1024 CPU shares default
      usedCpu: this.activeExecutors.size * (containerLimits?.cpu || 1024)
    };
  }

  /**
   * Ensure base image is available
   */
  private async ensureBaseImage(): Promise<void> {
    try {
      await this.docker.getImage(this.baseImage).inspect();
    } catch (error) {
      // Image not found, pull it
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
          resolve();
        });
      });
    });
  }

  /**
   * Create a new container for task execution
   */
  private async createContainer(sessionId: string, task: Task): Promise<Container> {
    const containerName = `claudecluster-session-${sessionId}`;
    const containerLimits = this.config.container?.resourceLimits;
    
    const createOptions: ContainerCreateOptions = {
      Image: this.baseImage,
      name: containerName,
      Labels: {
        'mcp.session': sessionId,
        'mcp.taskId': task.id,
        'mcp.type': 'claude-code-session',
        'mcp.created': new Date().toISOString()
      },
      Env: [
        `SESSION_ID=${sessionId}`,
        `TASK_ID=${task.id}`,
        `REPO_URL=${task.context?.repoUrl || ''}`,
        `CLAUDE_API_KEY=${process.env.CLAUDE_API_KEY || ''}`,
        `DEVCONTAINER=true`,
        `CLAUDE_CODE_VERSION=latest`,
        // Add custom environment variables
        ...Object.entries(this.config.container?.environment || {}).map(
          ([key, value]) => `${key}=${value}`
        )
      ],
      WorkingDir: '/workspace',
      User: 'node', // Use non-root user from base image
      HostConfig: {
        // Resource limits
        Memory: containerLimits?.memory || 4 * 1024 * 1024 * 1024, // 4GB default
        CpuShares: containerLimits?.cpu || 1024, // 1024 CPU shares default
        
        // Security settings
        AutoRemove: true, // Automatically remove when stopped
        NetworkMode: this.config.container?.networkMode || 'bridge',
        SecurityOpt: ['no-new-privileges:true'],
        CapDrop: ['ALL'], // Drop all capabilities
        ReadonlyRootfs: false, // Allow writes for code generation
        
        // No host mounts for security
        Binds: [],
        
        // Resource monitoring
        OomKillDisable: false,
        
        // Logging
        LogConfig: {
          Type: 'json-file',
          Config: {
            'max-size': '10m',
            'max-file': '3'
          }
        }
      }
    };

    return await this.docker.createContainer(createOptions);
  }

  /**
   * Get Docker client instance
   */
  getDocker(): Docker {
    return this.docker;
  }
}

export default ContainerProvider;