/**
 * @fileoverview Cluster management commands
 */

import { BaseCommand, createContext, addCommonOptions } from './base.js';
import type { CommandResult, ClusterOptions } from '../types/index.js';
import { handleAsync, ProgressIndicator, formatDuration, createResult } from '../utils/index.js';

/**
 * Worker resource information
 */
interface WorkerResources {
  cpuUsage?: number;
  memoryUsage?: number;
  diskUsage?: number;
}

/**
 * Worker information
 */
interface WorkerInfo {
  id: string;
  name: string;
  status: string;
  host: string;
  port: number;
  capabilities?: string[];
  currentTasks?: number;
  completedTasks?: number;
  failedTasks?: number;
  uptime?: number;
  lastSeen?: string;
  resources?: WorkerResources;
}

/**
 * Cluster status command
 */
export class ClusterStatusCommand extends BaseCommand {
  async execute(): Promise<CommandResult> {
    const result = await handleAsync(
      this.getClusterStatus(),
      'Failed to get cluster status'
    );
    
    if (!result.success) {
      return result;
    }
    
    const status = result.data;
    const uptime = status.uptime ? formatDuration(status.uptime) : 'Unknown';
    
    return createResult(true, {
      driver: {
        id: status.driver?.id,
        status: status.driver?.status,
        uptime: uptime
      },
      workers: {
        total: status.stats?.totalWorkers || 0,
        active: status.stats?.activeWorkers || 0,
        idle: (status.stats?.totalWorkers || 0) - (status.stats?.activeWorkers || 0)
      },
      tasks: {
        total: status.stats?.totalTasks || 0,
        running: status.stats?.runningTasks || 0,
        completed: status.stats?.completedTasks || 0,
        failed: status.stats?.failedTasks || 0
      },
      performance: {
        averageTaskDuration: status.stats?.averageTaskDuration 
          ? formatDuration(status.stats.averageTaskDuration)
          : 'N/A',
        tasksPerSecond: status.stats?.tasksPerSecond || 0,
        successRate: status.stats?.successRate 
          ? `${(status.stats.successRate * 100).toFixed(1)}%`
          : 'N/A'
      }
    });
  }
}

/**
 * Worker list command
 */
export class WorkerListCommand extends BaseCommand {
  async execute(): Promise<CommandResult> {
    const result = await handleAsync(
      this.getWorkers(),
      'Failed to get worker list'
    );
    
    if (!result.success) {
      return result;
    }
    
    const workers = result.data.workers.map((worker: any) => ({
      id: worker.id,
      name: worker.name,
      status: worker.status,
      currentTasks: worker.currentTasks?.length || 0,
      capabilities: worker.capabilities?.join(', ') || 'None',
      lastSeen: worker.lastSeen ? new Date(worker.lastSeen).toLocaleString() : 'Never',
      uptime: worker.uptime ? formatDuration(worker.uptime) : 'Unknown'
    }));
    
    return createResult(true, { workers });
  }
}

/**
 * Worker status command
 */
export class WorkerStatusCommand extends BaseCommand {
  async execute(workerId: string): Promise<CommandResult> {
    const result = await handleAsync(
      this.makeRequest('GET', `${this.context.driverUrl}/workers/${workerId}`),
      'Failed to get worker status'
    );
    
    if (!result.success) {
      return result;
    }
    
    const worker = result.data as WorkerInfo;
    
    return createResult(true, {
      id: worker.id,
      name: worker.name,
      status: worker.status,
      host: worker.host,
      port: worker.port,
      capabilities: worker.capabilities,
      currentTasks: worker.currentTasks,
      completedTasks: worker.completedTasks,
      failedTasks: worker.failedTasks,
      uptime: worker.uptime ? formatDuration(worker.uptime) : 'Unknown',
      lastSeen: worker.lastSeen ? new Date(worker.lastSeen).toLocaleString() : 'Never',
      resources: {
        cpuUsage: worker.resources?.cpuUsage 
          ? `${(worker.resources.cpuUsage * 100).toFixed(1)}%`
          : 'Unknown',
        memoryUsage: worker.resources?.memoryUsage
          ? `${(worker.resources.memoryUsage * 100).toFixed(1)}%`
          : 'Unknown',
        diskUsage: worker.resources?.diskUsage
          ? `${(worker.resources.diskUsage * 100).toFixed(1)}%`
          : 'Unknown'
      }
    });
  }
}

/**
 * Cluster start command
 */
export class ClusterStartCommand extends BaseCommand {
  async execute(options: ClusterOptions): Promise<CommandResult> {
    const spinner = new ProgressIndicator('Starting cluster...');
    spinner.start();
    
    try {
      // First check if cluster is already running
      try {
        const status = await this.getClusterStatus();
        if (status.driver?.status === 'running') {
          spinner.fail('Cluster is already running');
          return createResult(false, undefined, 'Cluster is already running');
        }
      } catch {
        // Cluster not running, continue with start
      }
      
      // Start driver
      spinner.updateMessage('Starting driver...');
      await this.makeRequest('POST', `${this.context.driverUrl}/start`, {
        workers: options.workers || 2,
        driverConfig: options.driverConfig,
        workerConfig: options.workerConfig
      });
      
      // Wait for driver to be ready
      spinner.updateMessage('Waiting for driver to be ready...');
      let attempts = 0;
      while (attempts < 30) {
        try {
          const status = await this.getClusterStatus();
          if (status.driver?.status === 'running') {
            break;
          }
        } catch {
          // Driver not ready yet
        }
        await new Promise(resolve => setTimeout(resolve, 1000));
        attempts++;
      }
      
      if (attempts >= 30) {
        spinner.fail('Driver failed to start within timeout');
        return createResult(false, undefined, 'Driver failed to start within timeout');
      }
      
      // Start MCP server if configured
      if (options.mcpConfig) {
        spinner.updateMessage('Starting MCP server...');
        await this.makeRequest('POST', `${this.context.mcpUrl}/start`, options.mcpConfig);
      }
      
      spinner.succeed('Cluster started successfully');
      
      // Get final status
      const finalStatus = await this.getClusterStatus();
      
      return createResult(true, {
        message: 'Cluster started successfully',
        driver: finalStatus.driver,
        workers: finalStatus.stats?.activeWorkers || 0,
        uptime: formatDuration(finalStatus.uptime || 0)
      });
      
    } catch (error) {
      spinner.fail('Failed to start cluster');
      return createResult(false, undefined, error instanceof Error ? error.message : String(error));
    }
  }
}

/**
 * Cluster stop command
 */
export class ClusterStopCommand extends BaseCommand {
  async execute(): Promise<CommandResult> {
    const spinner = new ProgressIndicator('Stopping cluster...');
    spinner.start();
    
    try {
      // Stop MCP server first
      try {
        spinner.updateMessage('Stopping MCP server...');
        await this.makeRequest('POST', `${this.context.mcpUrl}/stop`);
      } catch {
        // MCP server might not be running
      }
      
      // Stop driver (this will stop all workers)
      spinner.updateMessage('Stopping driver and workers...');
      await this.makeRequest('POST', `${this.context.driverUrl}/stop`);
      
      // Wait for graceful shutdown
      spinner.updateMessage('Waiting for graceful shutdown...');
      let attempts = 0;
      while (attempts < 30) {
        try {
          await this.getClusterStatus();
          // If we get a response, cluster is still running
        } catch {
          // Cluster stopped
          break;
        }
        await new Promise(resolve => setTimeout(resolve, 1000));
        attempts++;
      }
      
      spinner.succeed('Cluster stopped successfully');
      
      return createResult(true, {
        message: 'Cluster stopped successfully'
      });
      
    } catch (error) {
      spinner.fail('Failed to stop cluster');
      return createResult(false, undefined, error instanceof Error ? error.message : String(error));
    }
  }
}

/**
 * Cluster restart command
 */
export class ClusterRestartCommand extends BaseCommand {
  async execute(options: ClusterOptions): Promise<CommandResult> {
    const spinner = new ProgressIndicator('Restarting cluster...');
    spinner.start();
    
    try {
      // Stop cluster
      spinner.updateMessage('Stopping cluster...');
      const stopCommand = new ClusterStopCommand(this.context);
      const stopResult = await stopCommand.execute();
      
      if (!stopResult.success) {
        spinner.fail('Failed to stop cluster');
        return stopResult;
      }
      
      // Wait a moment for cleanup
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // Start cluster
      spinner.updateMessage('Starting cluster...');
      const startCommand = new ClusterStartCommand(this.context);
      const startResult = await startCommand.execute(options);
      
      if (!startResult.success) {
        spinner.fail('Failed to restart cluster');
        return startResult;
      }
      
      spinner.succeed('Cluster restarted successfully');
      
      return createResult(true, {
        message: 'Cluster restarted successfully',
        ...startResult.data
      });
      
    } catch (error) {
      spinner.fail('Failed to restart cluster');
      return createResult(false, undefined, error instanceof Error ? error.message : String(error));
    }
  }
}

/**
 * Add cluster commands to program
 */
export function addClusterCommands(program: any): void {
  const clusterCommand = program
    .command('cluster')
    .description('Cluster management commands');
  
  // Cluster status
  const statusCommand = clusterCommand
    .command('status')
    .description('Get cluster status')
    .action(async (options: any) => {
      const context = await createContext(options);
      const command = new ClusterStatusCommand(context);
      const result = await command.execute();
      command.outputResult(result);
    });
  
  addCommonOptions(statusCommand);
  
  // List workers
  const workersCommand = clusterCommand
    .command('workers')
    .description('List all workers')
    .action(async (options: any) => {
      const context = await createContext(options);
      const command = new WorkerListCommand(context);
      const result = await command.execute();
      command.outputResult(result);
    });
  
  addCommonOptions(workersCommand);
  
  // Worker status
  const workerCommand = clusterCommand
    .command('worker <workerId>')
    .description('Get worker status')
    .action(async (workerId: string, options: any) => {
      const context = await createContext(options);
      const command = new WorkerStatusCommand(context);
      const result = await command.execute(workerId);
      command.outputResult(result);
    });
  
  addCommonOptions(workerCommand);
  
  // Start cluster
  const startCommand = clusterCommand
    .command('start')
    .description('Start the cluster')
    .option('--workers <number>', 'Number of workers to start', '2')
    .option('--driver-config <config>', 'Driver configuration (JSON)')
    .option('--worker-config <config>', 'Worker configuration (JSON)')
    .option('--mcp-config <config>', 'MCP server configuration (JSON)')
    .action(async (options: any) => {
      const context = await createContext(options);
      const command = new ClusterStartCommand(context);
      
      const clusterOptions: ClusterOptions = {
        action: 'start',
        workers: parseInt(options.workers),
        driverConfig: options.driverConfig ? JSON.parse(options.driverConfig) : undefined,
        workerConfig: options.workerConfig ? JSON.parse(options.workerConfig) : undefined,
        mcpConfig: options.mcpConfig ? JSON.parse(options.mcpConfig) : undefined
      };
      
      const result = await command.execute(clusterOptions);
      command.outputResult(result);
    });
  
  addCommonOptions(startCommand);
  
  // Stop cluster
  const stopCommand = clusterCommand
    .command('stop')
    .description('Stop the cluster')
    .action(async (options: any) => {
      const context = await createContext(options);
      const command = new ClusterStopCommand(context);
      const result = await command.execute();
      command.outputResult(result);
    });
  
  addCommonOptions(stopCommand);
  
  // Restart cluster
  const restartCommand = clusterCommand
    .command('restart')
    .description('Restart the cluster')
    .option('--workers <number>', 'Number of workers to start', '2')
    .option('--driver-config <config>', 'Driver configuration (JSON)')
    .option('--worker-config <config>', 'Worker configuration (JSON)')
    .option('--mcp-config <config>', 'MCP server configuration (JSON)')
    .action(async (options: any) => {
      const context = await createContext(options);
      const command = new ClusterRestartCommand(context);
      
      const clusterOptions: ClusterOptions = {
        action: 'restart',
        workers: parseInt(options.workers),
        driverConfig: options.driverConfig ? JSON.parse(options.driverConfig) : undefined,
        workerConfig: options.workerConfig ? JSON.parse(options.workerConfig) : undefined,
        mcpConfig: options.mcpConfig ? JSON.parse(options.mcpConfig) : undefined
      };
      
      const result = await command.execute(clusterOptions);
      command.outputResult(result);
    });
  
  addCommonOptions(restartCommand);
}