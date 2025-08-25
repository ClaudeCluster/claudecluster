/**
 * @fileoverview Health check and monitoring utilities for ClaudeCluster
 */

import { cpus, freemem, totalmem, loadavg, uptime } from 'os';
import { promises as fs } from 'fs';
import { HealthStatus } from '@claudecluster/core';
import { Logger } from '../logger/index.js';
import { EventManager } from '../events/index.js';

/**
 * Health check result interface
 */
export interface HealthCheckResult {
  readonly name: string;
  readonly status: HealthStatus;
  readonly message?: string;
  readonly duration: number; // milliseconds
  readonly details?: Record<string, unknown>;
  readonly timestamp: Date;
}

/**
 * System resource information
 */
export interface SystemResources {
  readonly cpu: {
    readonly count: number;
    readonly usage: number; // percentage (0-100)
    readonly loadAverage: readonly [number, number, number]; // 1m, 5m, 15m
  };
  readonly memory: {
    readonly total: number; // bytes
    readonly free: number; // bytes
    readonly used: number; // bytes
    readonly usage: number; // percentage (0-100)
  };
  readonly disk?: {
    readonly total: number; // bytes
    readonly free: number; // bytes
    readonly used: number; // bytes
    readonly usage: number; // percentage (0-100)
  };
  readonly uptime: number; // seconds
  readonly timestamp: Date;
}

/**
 * Health check function type
 */
export type HealthCheckFunction = () => Promise<HealthCheckResult>;

/**
 * Health check configuration
 */
export interface HealthCheckConfig {
  readonly name: string;
  readonly timeout: number; // milliseconds
  readonly interval?: number; // milliseconds for periodic checks
  readonly enabled: boolean;
  readonly critical: boolean; // affects overall health status
}

/**
 * Monitoring thresholds
 */
export interface MonitoringThresholds {
  readonly cpu: {
    readonly warning: number; // percentage
    readonly critical: number; // percentage
  };
  readonly memory: {
    readonly warning: number; // percentage
    readonly critical: number; // percentage
  };
  readonly disk: {
    readonly warning: number; // percentage
    readonly critical: number; // percentage
  };
  readonly responseTime: {
    readonly warning: number; // milliseconds
    readonly critical: number; // milliseconds
  };
}

/**
 * Health monitor class
 */
export class HealthMonitor {
  private checks = new Map<string, HealthCheckConfig & { fn: HealthCheckFunction }>();
  private intervals = new Map<string, NodeJS.Timeout>();
  private lastResults = new Map<string, HealthCheckResult>();
  private isRunning = false;

  constructor(
    private serviceName: string,
    private thresholds: MonitoringThresholds,
    private logger?: Logger,
    private eventManager?: EventManager
  ) {}

  /**
   * Register a health check
   */
  registerCheck(
    config: HealthCheckConfig,
    fn: HealthCheckFunction
  ): void {
    this.checks.set(config.name, { ...config, fn });
    
    this.logger?.info('Health check registered', {
      component: 'health-monitor',
      serviceName: this.serviceName,
      checkName: config.name,
      critical: config.critical
    });

    // Start periodic checking if interval is specified
    if (config.interval && config.enabled) {
      this.startPeriodicCheck(config.name);
    }
  }

  /**
   * Unregister a health check
   */
  unregisterCheck(name: string): boolean {
    const removed = this.checks.delete(name);
    
    if (removed) {
      this.stopPeriodicCheck(name);
      this.lastResults.delete(name);
      
      this.logger?.info('Health check unregistered', {
        component: 'health-monitor',
        serviceName: this.serviceName,
        checkName: name
      });
    }
    
    return removed;
  }

  /**
   * Execute a specific health check
   */
  async executeCheck(name: string): Promise<HealthCheckResult> {
    const check = this.checks.get(name);
    if (!check) {
      throw new Error(`Health check not found: ${name}`);
    }

    if (!check.enabled) {
      return {
        name,
        status: HealthStatus.UNKNOWN,
        message: 'Check is disabled',
        duration: 0,
        timestamp: new Date()
      };
    }

    const startTime = Date.now();
    
    try {
      // Execute with timeout
      const result = await Promise.race([
        check.fn(),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('Health check timeout')), check.timeout)
        )
      ]);

      const duration = Date.now() - startTime;
      const finalResult = { ...result, duration, timestamp: new Date() };
      
      this.lastResults.set(name, finalResult);
      
      // Emit health check event
      this.eventManager?.emitSystemEvent('health-check', {
        serviceName: this.serviceName,
        check: finalResult
      });
      
      this.logger?.debug('Health check executed', {
        component: 'health-monitor',
        serviceName: this.serviceName,
        checkName: name,
        status: result.status,
        duration
      });

      return finalResult;
    } catch (error) {
      const duration = Date.now() - startTime;
      const result: HealthCheckResult = {
        name,
        status: HealthStatus.UNHEALTHY,
        message: error instanceof Error ? error.message : String(error),
        duration,
        timestamp: new Date()
      };
      
      this.lastResults.set(name, result);
      
      this.logger?.error(
        error instanceof Error ? error : new Error(String(error)),
        'Health check failed',
        {
          component: 'health-monitor',
          serviceName: this.serviceName,
          checkName: name,
          duration
        }
      );

      return result;
    }
  }

  /**
   * Execute all health checks
   */
  async executeAllChecks(): Promise<HealthCheckResult[]> {
    const checkNames = Array.from(this.checks.keys());
    const results = await Promise.all(
      checkNames.map(name => this.executeCheck(name))
    );
    
    return results;
  }

  /**
   * Get overall health status
   */
  async getOverallHealth(): Promise<{
    status: HealthStatus;
    checks: HealthCheckResult[];
    summary: {
      total: number;
      healthy: number;
      degraded: number;
      unhealthy: number;
      unknown: number;
    };
  }> {
    const results = await this.executeAllChecks();
    
    const summary = {
      total: results.length,
      healthy: results.filter(r => r.status === HealthStatus.HEALTHY).length,
      degraded: results.filter(r => r.status === HealthStatus.DEGRADED).length,
      unhealthy: results.filter(r => r.status === HealthStatus.UNHEALTHY).length,
      unknown: results.filter(r => r.status === HealthStatus.UNKNOWN).length
    };

    // Determine overall status
    let overallStatus: HealthStatus;
    const criticalChecks = results.filter(r => {
      const check = this.checks.get(r.name);
      return check?.critical;
    });

    if (criticalChecks.some(r => r.status === HealthStatus.UNHEALTHY)) {
      overallStatus = HealthStatus.UNHEALTHY;
    } else if (results.some(r => r.status === HealthStatus.UNHEALTHY)) {
      overallStatus = HealthStatus.DEGRADED;
    } else if (results.some(r => r.status === HealthStatus.DEGRADED)) {
      overallStatus = HealthStatus.DEGRADED;
    } else if (results.every(r => r.status === HealthStatus.HEALTHY)) {
      overallStatus = HealthStatus.HEALTHY;
    } else {
      overallStatus = HealthStatus.UNKNOWN;
    }

    return {
      status: overallStatus,
      checks: results,
      summary
    };
  }

  /**
   * Get system resources
   */
  async getSystemResources(): Promise<SystemResources> {
    const cpuInfo = cpus();
    const totalMem = totalmem();
    const freeMem = freemem();
    const usedMem = totalMem - freeMem;
    const memUsage = (usedMem / totalMem) * 100;

    // Calculate CPU usage (simplified)
    const cpuUsage = await this.getCpuUsage();

    let diskInfo: SystemResources['disk'];
    try {
      const stats = await fs.statfs('.');
      const total = stats.blocks * stats.bsize;
      const free = stats.bavail * stats.bsize;
      const used = total - free;
      diskInfo = {
        total,
        free,
        used,
        usage: (used / total) * 100
      };
    } catch (error) {
      // Disk info not available
      this.logger?.debug('Could not get disk info', {
        component: 'health-monitor',
        error: error instanceof Error ? error.message : String(error)
      });
    }

    return {
      cpu: {
        count: cpuInfo.length,
        usage: cpuUsage,
        loadAverage: loadavg() as [number, number, number]
      },
      memory: {
        total: totalMem,
        free: freeMem,
        used: usedMem,
        usage: memUsage
      },
      disk: diskInfo,
      uptime: uptime(),
      timestamp: new Date()
    };
  }

  /**
   * Check if system resources are healthy
   */
  async checkSystemHealth(): Promise<HealthCheckResult> {
    const startTime = Date.now();
    
    try {
      const resources = await this.getSystemResources();
      const issues: string[] = [];
      let status = HealthStatus.HEALTHY;

      // Check CPU
      if (resources.cpu.usage >= this.thresholds.cpu.critical) {
        issues.push(`CPU usage critical: ${resources.cpu.usage.toFixed(1)}%`);
        status = HealthStatus.UNHEALTHY;
      } else if (resources.cpu.usage >= this.thresholds.cpu.warning) {
        issues.push(`CPU usage high: ${resources.cpu.usage.toFixed(1)}%`);
        if (status === HealthStatus.HEALTHY) status = HealthStatus.DEGRADED;
      }

      // Check Memory
      if (resources.memory.usage >= this.thresholds.memory.critical) {
        issues.push(`Memory usage critical: ${resources.memory.usage.toFixed(1)}%`);
        status = HealthStatus.UNHEALTHY;
      } else if (resources.memory.usage >= this.thresholds.memory.warning) {
        issues.push(`Memory usage high: ${resources.memory.usage.toFixed(1)}%`);
        if (status === HealthStatus.HEALTHY) status = HealthStatus.DEGRADED;
      }

      // Check Disk
      if (resources.disk && resources.disk.usage >= this.thresholds.disk.critical) {
        issues.push(`Disk usage critical: ${resources.disk.usage.toFixed(1)}%`);
        status = HealthStatus.UNHEALTHY;
      } else if (resources.disk && resources.disk.usage >= this.thresholds.disk.warning) {
        issues.push(`Disk usage high: ${resources.disk.usage.toFixed(1)}%`);
        if (status === HealthStatus.HEALTHY) status = HealthStatus.DEGRADED;
      }

      return {
        name: 'system-resources',
        status,
        message: issues.length > 0 ? issues.join('; ') : 'System resources healthy',
        duration: Date.now() - startTime,
        details: resources as unknown as Record<string, unknown>,
        timestamp: new Date()
      };
    } catch (error) {
      return {
        name: 'system-resources',
        status: HealthStatus.UNHEALTHY,
        message: `Failed to check system resources: ${error instanceof Error ? error.message : String(error)}`,
        duration: Date.now() - startTime,
        timestamp: new Date()
      };
    }
  }

  /**
   * Start periodic checking for a specific check
   */
  private startPeriodicCheck(name: string): void {
    const check = this.checks.get(name);
    if (!check || !check.interval) return;

    this.stopPeriodicCheck(name); // Clear existing interval
    
    const interval = setInterval(async () => {
      try {
        await this.executeCheck(name);
      } catch (error) {
        this.logger?.error(
          error instanceof Error ? error : new Error(String(error)),
          'Periodic health check error',
          {
            component: 'health-monitor',
            checkName: name
          }
        );
      }
    }, check.interval);

    this.intervals.set(name, interval);
  }

  /**
   * Stop periodic checking for a specific check
   */
  private stopPeriodicCheck(name: string): void {
    const interval = this.intervals.get(name);
    if (interval) {
      clearInterval(interval);
      this.intervals.delete(name);
    }
  }

  /**
   * Start all periodic checks
   */
  start(): void {
    if (this.isRunning) return;
    
    this.isRunning = true;
    
    for (const [name, check] of this.checks) {
      if (check.enabled && check.interval) {
        this.startPeriodicCheck(name);
      }
    }
    
    this.logger?.info('Health monitor started', {
      component: 'health-monitor',
      serviceName: this.serviceName,
      checksCount: this.checks.size
    });
  }

  /**
   * Stop all periodic checks
   */
  stop(): void {
    if (!this.isRunning) return;
    
    this.isRunning = false;
    
    for (const name of this.intervals.keys()) {
      this.stopPeriodicCheck(name);
    }
    
    this.logger?.info('Health monitor stopped', {
      component: 'health-monitor',
      serviceName: this.serviceName
    });
  }

  /**
   * Get the last result for a specific check
   */
  getLastResult(name: string): HealthCheckResult | undefined {
    return this.lastResults.get(name);
  }

  /**
   * Get all last results
   */
  getAllLastResults(): Map<string, HealthCheckResult> {
    return new Map(this.lastResults);
  }

  /**
   * Calculate CPU usage
   */
  private async getCpuUsage(): Promise<number> {
    return new Promise((resolve) => {
      const startTime = Date.now();
      const startUsage = process.cpuUsage();
      
      setTimeout(() => {
        const endTime = Date.now();
        const endUsage = process.cpuUsage(startUsage);
        
        const userTime = endUsage.user / 1000; // microseconds to milliseconds
        const sysTime = endUsage.system / 1000;
        const totalTime = userTime + sysTime;
        const elapsedTime = endTime - startTime;
        
        const usage = (totalTime / elapsedTime) * 100;
        resolve(Math.min(usage, 100)); // Cap at 100%
      }, 100);
    });
  }
}

/**
 * Default monitoring thresholds
 */
export const defaultThresholds: MonitoringThresholds = {
  cpu: {
    warning: 70,
    critical: 90
  },
  memory: {
    warning: 80,
    critical: 95
  },
  disk: {
    warning: 80,
    critical: 95
  },
  responseTime: {
    warning: 1000,
    critical: 5000
  }
};

/**
 * Create common health checks
 */
export class CommonHealthChecks {
  /**
   * Create a basic readiness check
   */
  static createReadinessCheck(): HealthCheckFunction {
    return async () => ({
      name: 'readiness',
      status: HealthStatus.HEALTHY,
      message: 'Service is ready',
      duration: 0,
      timestamp: new Date()
    });
  }

  /**
   * Create a basic liveness check
   */
  static createLivenessCheck(): HealthCheckFunction {
    return async () => ({
      name: 'liveness',
      status: HealthStatus.HEALTHY,
      message: 'Service is alive',
      duration: 0,
      timestamp: new Date()
    });
  }

  /**
   * Create a disk space check
   */
  static createDiskSpaceCheck(path = '.', threshold = 90): HealthCheckFunction {
    return async () => {
      try {
        const stats = await fs.statfs(path);
        const total = stats.blocks * stats.bsize;
        const free = stats.bavail * stats.bsize;
        const usage = ((total - free) / total) * 100;
        
        let status: HealthStatus;
        let message: string;
        
        if (usage >= threshold) {
          status = HealthStatus.UNHEALTHY;
          message = `Disk usage critical: ${usage.toFixed(1)}%`;
        } else if (usage >= threshold * 0.8) {
          status = HealthStatus.DEGRADED;
          message = `Disk usage high: ${usage.toFixed(1)}%`;
        } else {
          status = HealthStatus.HEALTHY;
          message = `Disk usage normal: ${usage.toFixed(1)}%`;
        }
        
        return {
          name: 'disk-space',
          status,
          message,
          duration: 0,
          details: {
            path,
            total,
            free,
            usage: usage.toFixed(2)
          },
          timestamp: new Date()
        };
      } catch (error) {
        return {
          name: 'disk-space',
          status: HealthStatus.UNHEALTHY,
          message: `Failed to check disk space: ${error instanceof Error ? error.message : String(error)}`,
          duration: 0,
          timestamp: new Date()
        };
      }
    };
  }
}