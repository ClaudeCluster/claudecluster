/**
 * @fileoverview Configuration management system for ClaudeCluster
 */

import { config as dotenvConfig } from 'dotenv';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { parse as parseYaml } from 'yaml';
import { z } from 'zod';
import { LogLevel, ExecutionMode, createExecutionConfigFromEnv } from '@claudecluster/core';
import type { ExecutionConfigType } from '@claudecluster/core';

/**
 * Environment enumeration (local definition)
 */
export enum Environment {
  DEVELOPMENT = 'development',
  STAGING = 'staging', 
  PRODUCTION = 'production',
  TEST = 'test'
}

// Load environment variables from .env files
dotenvConfig();

/**
 * Base configuration schema with common fields
 */
export const BaseConfigSchema = z.object({
  environment: z.nativeEnum(Environment).default(Environment.DEVELOPMENT),
  logLevel: z.nativeEnum(LogLevel).default(LogLevel.INFO),
  version: z.string().default('0.1.0'),
  nodeEnv: z.string().optional()
});

/**
 * Worker configuration schema
 */
export const WorkerConfigSchema = BaseConfigSchema.extend({
  workerId: z.string().default(() => `worker-${Date.now()}`),
  port: z.number().int().min(1).max(65535).default(3001),
  host: z.string().default('localhost'),
  maxConcurrentTasks: z.number().int().positive().default(5),
  taskTimeout: z.number().int().positive().default(300000), // 5 minutes
  healthCheckInterval: z.number().int().positive().default(30000), // 30 seconds
  claudeCodePath: z.string().optional(),
  workspaceDir: z.string().default('./workspace'),
  tempDir: z.string().default('./temp'),
  enableMetrics: z.boolean().default(true),
  enableTracing: z.boolean().default(false),
  
  // Execution configuration
  executionMode: z.nativeEnum(ExecutionMode).default(ExecutionMode.PROCESS_POOL),
  enableAgenticMode: z.boolean().default(false),
  sessionTimeout: z.number().int().positive().default(3600000), // 1 hour
  
  // Container configuration
  containerConfig: z.object({
    image: z.string().default('ghcr.io/anthropics/claude-code:latest'),
    registry: z.string().default('ghcr.io'),
    networkName: z.string().default('claudecluster-network'),
    resourceLimits: z.object({
      memory: z.number().positive().default(2 * 1024 * 1024 * 1024), // 2GB
      cpu: z.number().positive().default(1024), // CPU shares
      timeout: z.number().positive().default(300) // 5 minutes
    }),
    securityOptions: z.array(z.string()).default(['no-new-privileges:true']),
    autoRemove: z.boolean().default(true),
    enableHealthChecks: z.boolean().default(true)
  }).optional(),
  
  // Process pool configuration
  processPoolConfig: z.object({
    maxProcesses: z.number().int().positive().default(5),
    minProcesses: z.number().int().nonnegative().default(1),
    processTimeout: z.number().int().positive().default(300000), // 5 minutes
    idleTimeout: z.number().int().positive().default(600000), // 10 minutes
    healthCheckInterval: z.number().int().positive().default(30000) // 30 seconds
  }).optional(),
  
  // Feature flags
  featureFlags: z.object({
    allowModeOverride: z.boolean().default(true),
    enableResourceMonitoring: z.boolean().default(true),
    enablePerformanceMetrics: z.boolean().default(true),
    experimentalFeatures: z.array(z.string()).default([])
  }).default({})
});

/**
 * Driver configuration schema  
 */
export const DriverConfigSchema = BaseConfigSchema.extend({
  driverId: z.string().default(() => `driver-${Date.now()}`),
  port: z.number().int().min(1).max(65535).default(3000),
  host: z.string().default('localhost'),
  maxWorkers: z.number().int().positive().default(10),
  maxConcurrentTasks: z.number().int().positive().default(50),
  taskTimeout: z.number().int().positive().default(600000), // 10 minutes
  healthCheckInterval: z.number().int().positive().default(15000), // 15 seconds
  retryAttempts: z.number().int().nonnegative().default(3),
  executionStrategy: z.enum(['sequential', 'parallel', 'adaptive']).default('adaptive'),
  enableLoadBalancing: z.boolean().default(true),
  enableMetrics: z.boolean().default(true),
  enableTracing: z.boolean().default(false)
});

/**
 * MCP server configuration schema
 */
export const McpConfigSchema = BaseConfigSchema.extend({
  mcpId: z.string().default(() => `mcp-${Date.now()}`),
  port: z.number().int().min(1).max(65535).default(3000),
  host: z.string().default('localhost'),
  enableWebSocket: z.boolean().default(true),
  maxConnections: z.number().int().positive().default(100),
  enableMetrics: z.boolean().default(true),
  enableTracing: z.boolean().default(false)
});

/**
 * Configuration type definitions
 */
export type BaseConfigType = z.infer<typeof BaseConfigSchema>;
export type WorkerConfigType = z.infer<typeof WorkerConfigSchema>;
export type DriverConfigType = z.infer<typeof DriverConfigSchema>;
export type McpConfigType = z.infer<typeof McpConfigSchema>;

/**
 * Configuration manager class
 */
export class ConfigManager {
  private static instance: ConfigManager;
  private configCache = new Map<string, unknown>();

  private constructor() {}

  /**
   * Get singleton instance
   */
  static getInstance(): ConfigManager {
    if (!ConfigManager.instance) {
      ConfigManager.instance = new ConfigManager();
    }
    return ConfigManager.instance;
  }

  /**
   * Load configuration from environment variables
   */
  loadFromEnv<T>(schema: z.ZodSchema<T>, prefix = ''): T {
    const env = process.env;
    const envWithPrefix = prefix ? 
      Object.fromEntries(
        Object.entries(env)
          .filter(([key]) => key.startsWith(prefix))
          .map(([key, value]) => [
            key.slice(prefix.length).toLowerCase(), 
            value
          ])
      ) : env;

    // Convert environment strings to appropriate types
    const processedEnv = Object.fromEntries(
      Object.entries(envWithPrefix).map(([key, value]) => {
        if (value === 'true') return [key, true];
        if (value === 'false') return [key, false];
        if (value && !isNaN(Number(value))) return [key, Number(value)];
        return [key, value];
      })
    );

    const result = schema.safeParse(processedEnv);
    if (!result.success) {
      const errors = result.error.errors.map(err => 
        `${err.path.join('.')}: ${err.message}`
      );
      throw new Error(`Configuration validation failed:\n${errors.join('\n')}`);
    }

    return result.data;
  }

  /**
   * Load configuration from JSON file
   */
  loadFromJsonFile<T>(schema: z.ZodSchema<T>, filePath: string): T {
    const cacheKey = `json:${filePath}`;
    
    if (this.configCache.has(cacheKey)) {
      return this.configCache.get(cacheKey) as T;
    }

    try {
      const absolutePath = resolve(filePath);
      const content = readFileSync(absolutePath, 'utf-8');
      const data = JSON.parse(content);
      
      const result = schema.safeParse(data);
      if (!result.success) {
        const errors = result.error.errors.map(err => 
          `${err.path.join('.')}: ${err.message}`
        );
        throw new Error(`Configuration validation failed for ${filePath}:\n${errors.join('\n')}`);
      }

      this.configCache.set(cacheKey, result.data);
      return result.data;
    } catch (error) {
      if (error instanceof Error && error.message.includes('validation failed')) {
        throw error;
      }
      throw new Error(`Failed to load configuration from ${filePath}: ${error}`);
    }
  }

  /**
   * Load configuration from YAML file
   */
  loadFromYamlFile<T>(schema: z.ZodSchema<T>, filePath: string): T {
    const cacheKey = `yaml:${filePath}`;
    
    if (this.configCache.has(cacheKey)) {
      return this.configCache.get(cacheKey) as T;
    }

    try {
      const absolutePath = resolve(filePath);
      const content = readFileSync(absolutePath, 'utf-8');
      const data = parseYaml(content);
      
      const result = schema.safeParse(data);
      if (!result.success) {
        const errors = result.error.errors.map(err => 
          `${err.path.join('.')}: ${err.message}`
        );
        throw new Error(`Configuration validation failed for ${filePath}:\n${errors.join('\n')}`);
      }

      this.configCache.set(cacheKey, result.data);
      return result.data;
    } catch (error) {
      if (error instanceof Error && error.message.includes('validation failed')) {
        throw error;
      }
      throw new Error(`Failed to load configuration from ${filePath}: ${error}`);
    }
  }

  /**
   * Load configuration with fallbacks (env -> file -> defaults)
   */
  loadWithFallbacks<T>(
    schema: z.ZodSchema<T>,
    options: {
      envPrefix?: string;
      jsonFile?: string;
      yamlFile?: string;
    } = {}
  ): T {
    // Try environment variables first
    try {
      return this.loadFromEnv(schema, options.envPrefix);
    } catch (envError) {
      // Try JSON file
      if (options.jsonFile) {
        try {
          return this.loadFromJsonFile(schema, options.jsonFile);
        } catch (jsonError) {
          // Continue to YAML file
        }
      }

      // Try YAML file
      if (options.yamlFile) {
        try {
          return this.loadFromYamlFile(schema, options.yamlFile);
        } catch (yamlError) {
          // Continue to defaults
        }
      }

      // Use defaults - empty object will trigger all default values
      const defaultResult = schema.safeParse({});
      if (defaultResult.success) {
        return defaultResult.data;
      } else {
        throw new Error(`Failed to load configuration with any method. Validation error: ${defaultResult.error.errors.map(e => e.message).join(', ')}`);
      }
    }
  }

  /**
   * Clear configuration cache
   */
  clearCache(): void {
    this.configCache.clear();
  }

  /**
   * Get cached configuration keys
   */
  getCachedKeys(): string[] {
    return Array.from(this.configCache.keys());
  }
}

/**
 * Default configuration manager instance
 */
export const configManager = ConfigManager.getInstance();

/**
 * Convenience functions for common configurations
 */
export function loadWorkerConfig(options?: Parameters<typeof configManager.loadWithFallbacks>[1]): WorkerConfigType {
  const result = configManager.loadWithFallbacks(WorkerConfigSchema, {
    envPrefix: 'WORKER_',
    jsonFile: './config/worker.json',
    yamlFile: './config/worker.yaml',
    ...options
  });
  return result as WorkerConfigType;
}

export function loadDriverConfig(options?: Parameters<typeof configManager.loadWithFallbacks>[1]): DriverConfigType {
  const result = configManager.loadWithFallbacks(DriverConfigSchema, {
    envPrefix: 'DRIVER_',
    jsonFile: './config/driver.json',
    yamlFile: './config/driver.yaml',
    ...options
  });
  return result as DriverConfigType;
}

export function loadMcpConfig(options?: Parameters<typeof configManager.loadWithFallbacks>[1]): McpConfigType {
  const result = configManager.loadWithFallbacks(McpConfigSchema, {
    envPrefix: 'MCP_',
    jsonFile: './config/mcp.json',
    yamlFile: './config/mcp.yaml',
    ...options
  });
  return result as McpConfigType;
}

/**
 * Load comprehensive execution configuration for workers
 * 
 * This function provides a simplified approach that prioritizes environment-based
 * configuration but allows override of specific values from config files.
 */
export function loadExecutionConfig(): ExecutionConfigType {
  // Start with environment-based configuration
  let config = createExecutionConfigFromEnv();
  
  // Try to load additional configuration from files and merge key values
  try {
    const fileConfig = configManager.loadWithFallbacks(WorkerConfigSchema, {
      envPrefix: 'WORKER_',
      jsonFile: './config/worker.json',
      yamlFile: './config/worker.yaml'
    });
    
    // Simple merge of key performance and execution mode values
    // More complex merging is handled by the execution providers themselves
    config = {
      ...config,
      mode: fileConfig.executionMode ?? config.mode,
      performance: {
        ...config.performance,
        maxConcurrentTasks: fileConfig.maxConcurrentTasks ?? config.performance.maxConcurrentTasks
      }
    };
    
  } catch (error) {
    // If file loading fails, use environment-based config as-is
  }
  
  return config;
}