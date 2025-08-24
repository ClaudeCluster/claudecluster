/**
 * Shared configuration schemas and utilities for ClaudeCluster
 */

import { z } from 'zod';
import { readFile, stat } from 'fs/promises';
import { join } from 'path';
import { homedir } from 'os';
import YAML from 'yaml';
import { ConfigValidator, validateConfigOrThrow } from './config-validator.js';
import { 
  createSafeConfigForLogging, 
  validateConfigSecurity, 
  replaceSecretsFromFiles,
  auditEnvironmentVariables 
} from './config-security.js';

// Base configuration schemas
export const serverConfigSchema = z.object({
  host: z.string().default('localhost'),
  port: z.number().int().min(1).max(65535).default(3000),
  cors: z.object({
    origin: z.union([z.string(), z.array(z.string())]).default('*'),
    credentials: z.boolean().default(true)
  }).default({}),
  rateLimit: z.object({
    windowMs: z.number().int().min(1000).default(60000), // 1 minute
    maxRequests: z.number().int().min(1).default(100)
  }).default({})
});

export const workerConfigSchema = z.object({
  id: z.string(),
  endpoint: z.string().url(),
  type: z.enum(['local', 'docker', 'cloud-run']).default('local'),
  config: z.record(z.unknown()).optional()
});

export const loggingConfigSchema = z.object({
  level: z.enum(['error', 'warn', 'info', 'debug']).default('info'),
  file: z.string().optional(),
  console: z.boolean().default(true),
  format: z.enum(['json', 'simple']).default('simple')
});

export const monitoringConfigSchema = z.object({
  enabled: z.boolean().default(true),
  heartbeatInterval: z.number().int().min(1000).default(30000), // 30 seconds
  taskTimeout: z.number().int().min(1000).default(300000), // 5 minutes
  retryAttempts: z.number().int().min(0).max(10).default(3)
});

// Component-specific configurations
export const cliConfigSchema = z.object({
  server: z.object({
    url: z.string().url().default('http://localhost:3000'),
    timeout: z.number().int().min(1000).default(30000)
  }).default({}),
  logging: loggingConfigSchema.default({}),
  defaults: z.object({
    priority: z.number().int().min(1).max(10).default(5),
    timeout: z.number().int().min(1).default(300) // seconds
  }).default({})
});

export const mcpConfigSchema = z.object({
  server: serverConfigSchema.default({}),
  workers: z.object({
    endpoints: z.array(z.string().url()).default(['http://localhost:3001']),
    maxRetries: z.number().int().min(1).max(10).default(3),
    requestTimeoutMs: z.number().int().min(1000).max(300000).default(30000),
    selectionStrategy: z.enum(['round-robin', 'least-loaded', 'random']).default('round-robin')
  }).default({}),
  logging: loggingConfigSchema.default({}),
  monitoring: monitoringConfigSchema.default({})
});

export const workerNodeConfigSchema = z.object({
  server: serverConfigSchema.default({}),
  worker: z.object({
    id: z.string().default('worker-1'),
    capabilities: z.object({
      maxConcurrentTasks: z.number().int().min(1).max(100).default(1),
      supportedCommands: z.array(z.string()).default(['run']),
      timeout: z.number().int().min(1000).default(300000) // 5 minutes
    }).default({})
  }).default({}),
  logging: loggingConfigSchema.default({}),
  monitoring: monitoringConfigSchema.default({})
});

// Environment-specific configurations
export const localConfigSchema = z.object({
  dataDir: z.string().default('./.claudecluster'),
  tempDir: z.string().optional(),
  maxWorkers: z.number().int().min(1).max(50).default(4)
});

export const dockerConfigSchema = z.object({
  network: z.string().default('claudecluster'),
  volumes: z.array(z.string()).default([]),
  environment: z.record(z.string()).default({})
});

export const cloudRunConfigSchema = z.object({
  project: z.string(),
  region: z.string().default('us-central1'),
  serviceAccount: z.string().optional(),
  resources: z.object({
    cpu: z.string().default('1000m'),
    memory: z.string().default('512Mi')
  }).default({}),
  scaling: z.object({
    minInstances: z.number().int().min(0).default(0),
    maxInstances: z.number().int().min(1).default(10)
  }).default({})
});

// Configuration file names to search for
export const CONFIG_FILENAMES = [
  'claudecluster.config.json',
  'claudecluster.config.yaml',
  'claudecluster.config.yml',
  '.claudecluster.json',
  '.claudecluster.yaml',
  '.claudecluster.yml',
  'claudecluster.json'
] as const;

// Environment variable prefixes
export const ENV_PREFIXES = {
  CLI: 'CLAUDECLUSTER_CLI_',
  MCP: 'CLAUDECLUSTER_MCP_',
  WORKER: 'CLAUDECLUSTER_WORKER_',
  GLOBAL: 'CLAUDECLUSTER_'
} as const;

/**
 * Configuration loading options
 */
export interface ConfigLoaderOptions {
  component: 'cli' | 'mcp' | 'worker';
  searchPaths?: string[];
  envPrefix?: string;
  schema?: z.ZodSchema;
  validateSchema?: boolean;
  loadDotenv?: boolean;
}

/**
 * Configuration source information
 */
export interface ConfigSource {
  type: 'file' | 'env' | 'default';
  path?: string;
  data: Record<string, unknown>;
}

/**
 * Configuration loading result
 */
export interface ConfigResult<T = unknown> {
  config: T;
  sources: ConfigSource[];
  errors: string[];
  warnings: string[];
}

/**
 * Base configuration loader class
 */
export class ConfigLoader {
  private options: Required<ConfigLoaderOptions>;
  
  constructor(options: ConfigLoaderOptions) {
    this.options = {
      searchPaths: [process.cwd(), homedir()],
      envPrefix: ENV_PREFIXES.GLOBAL,
      schema: z.record(z.unknown()),
      validateSchema: true,
      loadDotenv: true,
      ...options
    };
  }
  
  /**
   * Load configuration from all sources
   */
  async load<T = unknown>(): Promise<ConfigResult<T>> {
    const sources: ConfigSource[] = [];
    const errors: string[] = [];
    const warnings: string[] = [];
    
    // Load .env files if requested
    if (this.options.loadDotenv) {
      await this.loadDotenvFiles();
    }
    
    // Load from config files
    const fileConfig = await this.loadFromFiles();
    if (fileConfig) {
      sources.push(fileConfig);
    }
    
    // Load from environment variables
    const envConfig = this.loadFromEnvironment();
    if (Object.keys(envConfig.data).length > 0) {
      sources.push(envConfig);
    }
    
    // Merge configurations (later sources override earlier ones)
    let mergedConfig = this.mergeConfigs(sources.map(s => s.data));
    
    // Security validation
    for (const source of sources) {
      const securityWarnings = validateConfigSecurity(
        source.data, 
        source.type === 'file' ? `file:${source.path}` : source.type
      );
      warnings.push(...securityWarnings);
    }
    
    // Process file:// secret references
    try {
      mergedConfig = await replaceSecretsFromFiles(mergedConfig);
    } catch (error) {
      errors.push(`Secret loading failed: ${error instanceof Error ? error.message : error}`);
    }
    
    // Validate schema if requested
    let validatedConfig = mergedConfig;
    if (this.options.validateSchema) {
      try {
        validatedConfig = this.options.schema.parse(mergedConfig);
      } catch (error) {\n        if (error instanceof z.ZodError) {\n          const validation = ConfigValidator['validateWithSchema'](
            this.options.schema,
            mergedConfig,
            this.options.component.toUpperCase()
          );
          
          errors.push(...validation.errors.map(e => 
            `${e.path}: ${e.message}${e.expected ? ` (expected: ${e.expected})` : ''}`
          ));
          
          // Add helpful suggestions
          const suggestions = ConfigValidator.getSuggestions(validation.errors, this.options.component.toUpperCase());
          warnings.push(...suggestions);\n        } else {\n          errors.push(`Configuration validation failed: ${error}`);\n        }\n      }\n    }\n    \n    return {\n      config: validatedConfig as T,\n      sources,\n      errors,\n      warnings\n    };\n  }\n  \n  /**\n   * Load .env files using dotenv\n   */\n  private async loadDotenvFiles(): Promise<void> {\n    // Try to load dotenv dynamically\n    try {\n      const dotenv = await import('dotenv');\n      \n      // Load from current directory\n      const envPaths = [\n        join(process.cwd(), '.env'),\n        join(process.cwd(), '.env.local'),\n        join(process.cwd(), '.env.development'),\n        join(process.cwd(), '.env.production')\n      ];\n      \n      for (const envPath of envPaths) {\n        try {\n          await stat(envPath);\n          dotenv.config({ path: envPath });\n        } catch {\n          // File doesn't exist, continue\n        }\n      }\n    } catch {\n      // dotenv not available, skip\n    }\n  }\n  \n  /**\n   * Load configuration from files\n   */\n  private async loadFromFiles(): Promise<ConfigSource | null> {\n    for (const searchPath of this.options.searchPaths) {\n      for (const filename of CONFIG_FILENAMES) {\n        const configPath = join(searchPath, filename);\n        \n        try {\n          await stat(configPath);\n          const content = await readFile(configPath, 'utf-8');\n          \n          let data: Record<string, unknown>;\n          if (filename.endsWith('.json')) {\n            data = JSON.parse(content);\n          } else {\n            data = YAML.parse(content);\n          }\n          \n          return {\n            type: 'file',\n            path: configPath,\n            data\n          };\n        } catch {\n          // File doesn't exist or is invalid, continue\n          continue;\n        }\n      }\n    }\n    \n    return null;\n  }\n  \n  /**\n   * Load configuration from environment variables\n   */\n  private loadFromEnvironment(): ConfigSource {\n    const data: Record<string, unknown> = {};\n    const prefix = this.options.envPrefix;\n    \n    for (const [key, value] of Object.entries(process.env)) {\n      if (key.startsWith(prefix)) {\n        const configKey = key\n          .substring(prefix.length)\n          .toLowerCase()\n          .replace(/_/g, '.');\n        \n        // Try to parse as JSON, otherwise use as string\n        let parsedValue: unknown = value;\n        try {\n          parsedValue = JSON.parse(value!);\n        } catch {\n          // Use as string\n        }\n        \n        this.setNestedValue(data, configKey, parsedValue);\n      }\n    }\n    \n    return {\n      type: 'env',\n      data\n    };\n  }\n  \n  /**\n   * Set nested object value from dot notation key\n   */\n  private setNestedValue(obj: Record<string, unknown>, key: string, value: unknown): void {\n    const keys = key.split('.');\n    let current = obj;\n    \n    for (let i = 0; i < keys.length - 1; i++) {\n      const k = keys[i];\n      if (!(k in current) || typeof current[k] !== 'object' || current[k] === null) {\n        current[k] = {};\n      }\n      current = current[k] as Record<string, unknown>;\n    }\n    \n    current[keys[keys.length - 1]] = value;\n  }\n  \n  /**\n   * Merge multiple configuration objects\n   */\n  private mergeConfigs(configs: Record<string, unknown>[]): Record<string, unknown> {\n    const result: Record<string, unknown> = {};\n    \n    for (const config of configs) {\n      this.deepMerge(result, config);\n    }\n    \n    return result;\n  }\n  \n  /**\n   * Deep merge two objects\n   */\n  private deepMerge(target: Record<string, unknown>, source: Record<string, unknown>): void {\n    for (const [key, value] of Object.entries(source)) {\n      if (value && typeof value === 'object' && !Array.isArray(value)) {\n        if (!(key in target) || typeof target[key] !== 'object' || target[key] === null) {\n          target[key] = {};\n        }\n        this.deepMerge(target[key] as Record<string, unknown>, value as Record<string, unknown>);\n      } else {\n        target[key] = value;\n      }\n    }\n  }\n}\n\n/**\n * Utility functions for creating component-specific loaders\n */\nexport function createCLIConfigLoader(options?: Partial<ConfigLoaderOptions>): ConfigLoader {\n  return new ConfigLoader({\n    component: 'cli',\n    envPrefix: ENV_PREFIXES.CLI,\n    schema: cliConfigSchema,\n    ...options\n  });\n}\n\nexport function createMCPConfigLoader(options?: Partial<ConfigLoaderOptions>): ConfigLoader {\n  return new ConfigLoader({\n    component: 'mcp',\n    envPrefix: ENV_PREFIXES.MCP,\n    schema: mcpConfigSchema,\n    ...options\n  });\n}\n\nexport function createWorkerConfigLoader(options?: Partial<ConfigLoaderOptions>): ConfigLoader {\n  return new ConfigLoader({\n    component: 'worker',\n    envPrefix: ENV_PREFIXES.WORKER,\n    schema: workerNodeConfigSchema,\n    ...options\n  });\n}\n\n// Export inferred types\nexport type CLIConfig = z.infer<typeof cliConfigSchema>;\nexport type MCPConfig = z.infer<typeof mcpConfigSchema>;\nexport type WorkerNodeConfig = z.infer<typeof workerNodeConfigSchema>;\nexport type ServerConfig = z.infer<typeof serverConfigSchema>;\nexport type LoggingConfig = z.infer<typeof loggingConfigSchema>;\nexport type MonitoringConfig = z.infer<typeof monitoringConfigSchema>;