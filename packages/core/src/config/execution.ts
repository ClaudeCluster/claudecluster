/**
 * @fileoverview Execution configuration types and schemas for ClaudeCluster
 */

import { z } from 'zod';

/**
 * Execution modes supported by ClaudeCluster
 */
export enum ExecutionMode {
  PROCESS_POOL = 'process_pool',
  CONTAINER_AGENTIC = 'container_agentic'
}

/**
 * Container orchestrator types
 */
export enum ContainerOrchestrator {
  DOCKER = 'docker',
  KUBERNETES = 'kubernetes',
  ECS = 'ecs'
}

/**
 * Resource limits configuration
 */
export interface ResourceLimits {
  readonly memory: number; // in bytes
  readonly cpu: number; // CPU shares or cores depending on context
  readonly timeout: number; // in seconds
  readonly diskSize?: number; // in bytes
}

/**
 * Process pool specific configuration
 */
export interface ProcessPoolConfig {
  readonly maxProcesses: number;
  readonly minProcesses: number;
  readonly processTimeout: number; // milliseconds
  readonly claudeCodePath: string;
  readonly idleTimeout: number; // milliseconds
  readonly healthCheckInterval: number; // milliseconds
  readonly workspaceDir: string;
  readonly tempDir: string;
}

/**
 * Container specific configuration
 */
export interface ContainerConfig {
  readonly orchestrator: ContainerOrchestrator;
  readonly image: string;
  readonly registry: string;
  readonly resourceLimits: ResourceLimits;
  readonly networkMode: string;
  readonly securityOptions: readonly string[];
  readonly environmentVariables: Record<string, string>;
  readonly sessionTimeout: number; // milliseconds
  readonly autoRemove: boolean;
  readonly readOnlyRootfs: boolean;
  readonly enableHealthChecks: boolean;
  readonly wrapperScriptPath: string;
}

/**
 * Feature flags for execution capabilities
 */
export interface ExecutionFeatureFlags {
  readonly enableContainerMode: boolean;
  readonly enableProcessPoolMode: boolean;
  readonly allowModeOverride: boolean;
  readonly enableSessionPersistence: boolean;
  readonly enableResourceMonitoring: boolean;
  readonly enablePerformanceMetrics: boolean;
  readonly supportedProviders: readonly string[];
  readonly experimentalFeatures: readonly string[];
}

/**
 * Authentication configuration
 */
export interface AuthConfig {
  readonly claudeApiKey: string;
  readonly apiKeySource: 'environment' | 'file' | 'vault';
  readonly apiKeyPath?: string; // for file or vault sources
  readonly refreshTokens: boolean;
  readonly tokenExpirationBuffer: number; // seconds
}

/**
 * Monitoring and observability configuration
 */
export interface MonitoringConfig {
  readonly enableMetrics: boolean;
  readonly enableTracing: boolean;
  readonly enableHealthChecks: boolean;
  readonly metricsInterval: number; // milliseconds
  readonly healthCheckInterval: number; // milliseconds
  readonly logLevel: 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal';
  readonly enableStructuredLogging: boolean;
  readonly enableAuditLogging: boolean;
}

/**
 * Security configuration
 */
export interface SecurityConfig {
  readonly enableSandboxing: boolean;
  readonly isolationLevel: 'process' | 'container' | 'vm';
  readonly allowNetworkAccess: boolean;
  readonly allowFileSystemAccess: boolean;
  readonly restrictedPaths: readonly string[];
  readonly allowedDomains: readonly string[];
  readonly enableDataRedaction: boolean;
  readonly auditSensitiveOperations: boolean;
}

/**
 * Performance tuning configuration
 */
export interface PerformanceConfig {
  readonly maxConcurrentTasks: number;
  readonly taskQueueSize: number;
  readonly executionTimeout: number; // milliseconds
  readonly idleTimeout: number; // milliseconds
  readonly resourcePollingInterval: number; // milliseconds
  readonly enableCaching: boolean;
  readonly cacheSize: number; // entries
  readonly cacheTtl: number; // milliseconds
}

/**
 * Complete execution configuration
 */
export interface ExecutionConfig {
  readonly mode: ExecutionMode;
  readonly fallbackMode?: ExecutionMode;
  readonly processPool?: ProcessPoolConfig;
  readonly container?: ContainerConfig;
  readonly featureFlags: ExecutionFeatureFlags;
  readonly auth: AuthConfig;
  readonly monitoring: MonitoringConfig;
  readonly security: SecurityConfig;
  readonly performance: PerformanceConfig;
  readonly customProperties?: Record<string, unknown>;
}

/**
 * Zod schemas for runtime validation
 */

export const ExecutionModeSchema = z.nativeEnum(ExecutionMode);
export const ContainerOrchestratorSchema = z.nativeEnum(ContainerOrchestrator);

export const ResourceLimitsSchema = z.object({
  memory: z.number().positive().describe('Memory limit in bytes'),
  cpu: z.number().positive().describe('CPU shares or cores'),
  timeout: z.number().positive().describe('Timeout in seconds'),
  diskSize: z.number().positive().optional().describe('Disk size in bytes')
});

export const ProcessPoolConfigSchema = z.object({
  maxProcesses: z.number().int().positive().max(100).describe('Maximum number of processes'),
  minProcesses: z.number().int().nonnegative().describe('Minimum number of processes'),
  processTimeout: z.number().int().positive().describe('Process timeout in milliseconds'),
  claudeCodePath: z.string().min(1).describe('Path to Claude Code executable'),
  idleTimeout: z.number().int().positive().describe('Idle timeout in milliseconds'),
  healthCheckInterval: z.number().int().positive().describe('Health check interval in milliseconds'),
  workspaceDir: z.string().min(1).describe('Workspace directory path'),
  tempDir: z.string().min(1).describe('Temporary directory path')
}).refine(data => data.minProcesses <= data.maxProcesses, {
  message: 'minProcesses must be less than or equal to maxProcesses'
});

export const ContainerConfigSchema = z.object({
  orchestrator: ContainerOrchestratorSchema,
  image: z.string().min(1).describe('Container image name'),
  registry: z.string().min(1).describe('Container registry URL'),
  resourceLimits: ResourceLimitsSchema,
  networkMode: z.string().min(1).default('bridge').describe('Container network mode'),
  securityOptions: z.array(z.string()).describe('Security options for container'),
  environmentVariables: z.record(z.string()).describe('Environment variables'),
  sessionTimeout: z.number().int().positive().describe('Session timeout in milliseconds'),
  autoRemove: z.boolean().default(true).describe('Auto remove container after execution'),
  readOnlyRootfs: z.boolean().default(false).describe('Read-only root filesystem'),
  enableHealthChecks: z.boolean().default(true).describe('Enable container health checks'),
  wrapperScriptPath: z.string().default('/usr/local/bin/claude-prototype-wrapper.sh').describe('Wrapper script path')
});

export const ExecutionFeatureFlagsSchema = z.object({
  enableContainerMode: z.boolean().describe('Enable container execution mode'),
  enableProcessPoolMode: z.boolean().describe('Enable process pool execution mode'),
  allowModeOverride: z.boolean().describe('Allow runtime mode override'),
  enableSessionPersistence: z.boolean().describe('Enable session persistence'),
  enableResourceMonitoring: z.boolean().describe('Enable resource monitoring'),
  enablePerformanceMetrics: z.boolean().describe('Enable performance metrics'),
  supportedProviders: z.array(z.string()).describe('Supported execution providers'),
  experimentalFeatures: z.array(z.string()).describe('Experimental features to enable')
});

export const AuthConfigSchema = z.object({
  claudeApiKey: z.string().describe('Claude API key - can be empty for testing/development'),
  apiKeySource: z.enum(['environment', 'file', 'vault']).describe('Source of API key'),
  apiKeyPath: z.string().optional().describe('Path to API key file or vault path'),
  refreshTokens: z.boolean().default(true).describe('Enable token refresh'),
  tokenExpirationBuffer: z.number().int().positive().default(300).describe('Token expiration buffer in seconds')
});

export const MonitoringConfigSchema = z.object({
  enableMetrics: z.boolean().default(true).describe('Enable metrics collection'),
  enableTracing: z.boolean().default(false).describe('Enable distributed tracing'),
  enableHealthChecks: z.boolean().default(true).describe('Enable health checks'),
  metricsInterval: z.number().int().positive().default(60000).describe('Metrics collection interval'),
  healthCheckInterval: z.number().int().positive().default(30000).describe('Health check interval'),
  logLevel: z.enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal']).default('info').describe('Log level'),
  enableStructuredLogging: z.boolean().default(true).describe('Enable structured logging'),
  enableAuditLogging: z.boolean().default(false).describe('Enable audit logging')
});

export const SecurityConfigSchema = z.object({
  enableSandboxing: z.boolean().default(true).describe('Enable sandboxing'),
  isolationLevel: z.enum(['process', 'container', 'vm']).default('container').describe('Isolation level'),
  allowNetworkAccess: z.boolean().default(true).describe('Allow network access'),
  allowFileSystemAccess: z.boolean().default(true).describe('Allow file system access'),
  restrictedPaths: z.array(z.string()).default([]).describe('Restricted file paths'),
  allowedDomains: z.array(z.string()).default([]).describe('Allowed network domains'),
  enableDataRedaction: z.boolean().default(true).describe('Enable sensitive data redaction'),
  auditSensitiveOperations: z.boolean().default(true).describe('Audit sensitive operations')
});

export const PerformanceConfigSchema = z.object({
  maxConcurrentTasks: z.number().int().positive().max(1000).describe('Maximum concurrent tasks'),
  taskQueueSize: z.number().int().positive().default(100).describe('Task queue size'),
  executionTimeout: z.number().int().positive().default(300000).describe('Execution timeout in milliseconds'),
  idleTimeout: z.number().int().positive().default(600000).describe('Idle timeout in milliseconds'),
  resourcePollingInterval: z.number().int().positive().default(5000).describe('Resource polling interval'),
  enableCaching: z.boolean().default(true).describe('Enable result caching'),
  cacheSize: z.number().int().positive().default(1000).describe('Cache size in entries'),
  cacheTtl: z.number().int().positive().default(3600000).describe('Cache TTL in milliseconds')
});

export const ExecutionConfigSchema = z.object({
  mode: ExecutionModeSchema.describe('Primary execution mode'),
  fallbackMode: ExecutionModeSchema.optional().describe('Fallback execution mode'),
  processPool: ProcessPoolConfigSchema.optional().describe('Process pool configuration'),
  container: ContainerConfigSchema.optional().describe('Container configuration'),
  featureFlags: ExecutionFeatureFlagsSchema.describe('Feature flags'),
  auth: AuthConfigSchema.describe('Authentication configuration'),
  monitoring: MonitoringConfigSchema.describe('Monitoring configuration'),
  security: SecurityConfigSchema.describe('Security configuration'),
  performance: PerformanceConfigSchema.describe('Performance configuration'),
  customProperties: z.record(z.unknown()).optional().describe('Custom properties')
}).refine(data => {
  // Ensure required configuration is present for selected mode
  if (data.mode === ExecutionMode.PROCESS_POOL && !data.processPool) {
    return false;
  }
  if (data.mode === ExecutionMode.CONTAINER_AGENTIC && !data.container) {
    return false;
  }
  return true;
}, {
  message: 'Required configuration missing for selected execution mode'
});

/**
 * Type inference helpers
 */
export type ExecutionConfigType = z.infer<typeof ExecutionConfigSchema>;
export type ProcessPoolConfigType = z.infer<typeof ProcessPoolConfigSchema>;
export type ContainerConfigType = z.infer<typeof ContainerConfigSchema>;
export type ResourceLimitsType = z.infer<typeof ResourceLimitsSchema>;
export type ExecutionFeatureFlagsType = z.infer<typeof ExecutionFeatureFlagsSchema>;
export type AuthConfigType = z.infer<typeof AuthConfigSchema>;
export type MonitoringConfigType = z.infer<typeof MonitoringConfigSchema>;
export type SecurityConfigType = z.infer<typeof SecurityConfigSchema>;
export type PerformanceConfigType = z.infer<typeof PerformanceConfigSchema>;

/**
 * Default configurations
 */

export const defaultResourceLimits: ResourceLimitsType = {
  memory: 2 * 1024 * 1024 * 1024, // 2GB
  cpu: 1024, // CPU shares
  timeout: 300 // 5 minutes
};

export const defaultProcessPoolConfig: ProcessPoolConfigType = {
  maxProcesses: 5,
  minProcesses: 1,
  processTimeout: 300000, // 5 minutes
  claudeCodePath: '/usr/local/bin/claude-code',
  idleTimeout: 600000, // 10 minutes
  healthCheckInterval: 30000, // 30 seconds
  workspaceDir: './workspace',
  tempDir: './temp'
};

export const defaultContainerConfig: ContainerConfigType = {
  orchestrator: ContainerOrchestrator.DOCKER,
  image: 'ghcr.io/anthropics/claude-code:latest',
  registry: 'ghcr.io',
  resourceLimits: defaultResourceLimits,
  networkMode: 'bridge',
  securityOptions: ['no-new-privileges:true'],
  environmentVariables: {},
  sessionTimeout: 3600000, // 1 hour
  autoRemove: true,
  readOnlyRootfs: false,
  enableHealthChecks: true,
  wrapperScriptPath: '/usr/local/bin/claude-prototype-wrapper.sh'
};

export const defaultExecutionFeatureFlags: ExecutionFeatureFlagsType = {
  enableContainerMode: true,
  enableProcessPoolMode: true,
  allowModeOverride: true,
  enableSessionPersistence: false,
  enableResourceMonitoring: true,
  enablePerformanceMetrics: true,
  supportedProviders: ['docker', 'process-pool'],
  experimentalFeatures: []
};

export const defaultAuthConfig: AuthConfigType = {
  claudeApiKey: process.env['CLAUDE_API_KEY'] || '',
  apiKeySource: 'environment',
  refreshTokens: true,
  tokenExpirationBuffer: 300
};

export const defaultMonitoringConfig: MonitoringConfigType = {
  enableMetrics: true,
  enableTracing: false,
  enableHealthChecks: true,
  metricsInterval: 60000,
  healthCheckInterval: 30000,
  logLevel: 'info',
  enableStructuredLogging: true,
  enableAuditLogging: false
};

export const defaultSecurityConfig: SecurityConfigType = {
  enableSandboxing: true,
  isolationLevel: 'container',
  allowNetworkAccess: true,
  allowFileSystemAccess: true,
  restrictedPaths: ['/etc', '/sys', '/proc'],
  allowedDomains: [],
  enableDataRedaction: true,
  auditSensitiveOperations: true
};

export const defaultPerformanceConfig: PerformanceConfigType = {
  maxConcurrentTasks: 10,
  taskQueueSize: 100,
  executionTimeout: 300000,
  idleTimeout: 600000,
  resourcePollingInterval: 5000,
  enableCaching: true,
  cacheSize: 1000,
  cacheTtl: 3600000
};

/**
 * Default execution configurations for different modes
 */
export const defaultProcessPoolExecutionConfig: ExecutionConfigType = {
  mode: ExecutionMode.PROCESS_POOL,
  processPool: defaultProcessPoolConfig,
  featureFlags: {
    ...defaultExecutionFeatureFlags,
    enableContainerMode: false
  },
  auth: defaultAuthConfig,
  monitoring: defaultMonitoringConfig,
  security: {
    ...defaultSecurityConfig,
    isolationLevel: 'process'
  },
  performance: defaultPerformanceConfig
};

export const defaultContainerExecutionConfig: ExecutionConfigType = {
  mode: ExecutionMode.CONTAINER_AGENTIC,
  fallbackMode: ExecutionMode.PROCESS_POOL,
  container: defaultContainerConfig,
  processPool: defaultProcessPoolConfig, // For fallback
  featureFlags: defaultExecutionFeatureFlags,
  auth: defaultAuthConfig,
  monitoring: defaultMonitoringConfig,
  security: defaultSecurityConfig,
  performance: {
    ...defaultPerformanceConfig,
    maxConcurrentTasks: 20 // Containers can handle more concurrent tasks
  }
};

/**
 * Configuration factory functions
 */

/**
 * Create execution config from environment variables
 */
export function createExecutionConfigFromEnv(): ExecutionConfigType {
  const mode = (process.env['EXECUTION_MODE'] as ExecutionMode) || ExecutionMode.PROCESS_POOL;
  const baseConfig = mode === ExecutionMode.CONTAINER_AGENTIC 
    ? defaultContainerExecutionConfig 
    : defaultProcessPoolExecutionConfig;

  return ExecutionConfigSchema.parse({
    ...baseConfig,
    mode,
    auth: {
      ...baseConfig.auth,
      claudeApiKey: process.env['CLAUDE_API_KEY'] || baseConfig.auth.claudeApiKey
    },
    performance: {
      ...baseConfig.performance,
      maxConcurrentTasks: parseInt(process.env['MAX_CONCURRENT_TASKS'] || '') || baseConfig.performance.maxConcurrentTasks
    }
  });
}

/**
 * Validate execution configuration
 */
export function validateExecutionConfig(config: unknown): ExecutionConfigType {
  return ExecutionConfigSchema.parse(config);
}

/**
 * Merge execution configurations with precedence
 */
export function mergeExecutionConfigs(
  base: ExecutionConfigType,
  override: Partial<ExecutionConfigType>
): ExecutionConfigType {
  const merged = {
    ...base,
    ...override,
    processPool: override.processPool ? { ...base.processPool, ...override.processPool } : base.processPool,
    container: override.container ? { ...base.container, ...override.container } : base.container,
    featureFlags: override.featureFlags ? { ...base.featureFlags, ...override.featureFlags } : base.featureFlags,
    auth: override.auth ? { ...base.auth, ...override.auth } : base.auth,
    monitoring: override.monitoring ? { ...base.monitoring, ...override.monitoring } : base.monitoring,
    security: override.security ? { ...base.security, ...override.security } : base.security,
    performance: override.performance ? { ...base.performance, ...override.performance } : base.performance
  };

  return ExecutionConfigSchema.parse(merged);
}