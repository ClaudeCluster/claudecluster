/**
 * @fileoverview Configuration Schema for ClaudeCluster Worker
 * 
 * This module defines comprehensive configuration types that support both
 * process pool and container execution modes, extending the base WorkerConfig
 * from the core package with execution-specific settings.
 */

import { ExecutionMode } from '../execution/provider';

/**
 * Resource limits for execution environments
 */
export interface ResourceLimits {
  /** Memory limit in bytes */
  memory: number;
  /** CPU limit in cores (can be fractional, e.g., 0.5 for half a core) */
  cpu: number;
  /** Timeout in seconds for task execution */
  timeout: number;
  /** Optional disk size limit in bytes */
  diskSize?: number;
  /** Network bandwidth limit in bytes per second (optional) */
  networkBandwidth?: number;
}

/**
 * Configuration for process pool execution mode
 */
export interface ProcessPoolConfig {
  /** Maximum number of concurrent processes */
  maxProcesses: number;
  /** Timeout for individual processes in milliseconds */
  processTimeout: number;
  /** Path to Claude Code executable */
  claudeCodePath: string;
  /** Additional environment variables for processes */
  environmentVariables?: Record<string, string>;
  /** Working directory for processes (defaults to current directory) */
  workingDirectory?: string;
  /** Whether to reuse processes for multiple tasks */
  reuseProcesses?: boolean;
  /** Process pool warmup settings */
  warmup?: {
    /** Number of processes to pre-initialize */
    preInitCount: number;
    /** Whether to enable warmup */
    enabled: boolean;
  };
}

/**
 * Configuration for container-based execution mode
 */
export interface ContainerConfig {
  /** Container orchestrator to use */
  orchestrator: 'docker' | 'kubernetes' | 'ecs';
  /** Container image name and tag */
  image: string;
  /** Container registry URL */
  registry: string;
  /** Resource limits for containers */
  resourceLimits: ResourceLimits;
  /** Container network configuration */
  network?: {
    /** Network mode (bridge, host, none, custom network name) */
    mode: string;
    /** Port mappings (container_port -> host_port) */
    portMappings?: Record<number, number>;
    /** DNS configuration */
    dns?: string[];
  };
  /** Container security settings */
  security?: {
    /** Run as non-root user */
    runAsUser?: number;
    /** Run as specific group */
    runAsGroup?: number;
    /** Security options (e.g., --security-opt) */
    securityOpts?: string[];
    /** Whether to run in privileged mode */
    privileged?: boolean;
    /** Capabilities to add */
    capAdd?: string[];
    /** Capabilities to drop */
    capDrop?: string[];
  };
  /** Environment variables for containers */
  environmentVariables?: Record<string, string>;
  /** Volume mounts */
  volumes?: {
    /** Host path */
    hostPath: string;
    /** Container path */
    containerPath: string;
    /** Read-only flag */
    readOnly?: boolean;
  }[];
  /** Container health check configuration */
  healthCheck?: {
    /** Command to run for health check */
    command: string[];
    /** Interval between health checks in seconds */
    interval: number;
    /** Timeout for each health check in seconds */
    timeout: number;
    /** Number of retries before considering unhealthy */
    retries: number;
    /** Grace period before first health check in seconds */
    startPeriod?: number;
  };
  /** Container restart policy */
  restartPolicy?: {
    /** Restart policy name */
    name: 'no' | 'always' | 'unless-stopped' | 'on-failure';
    /** Maximum retry count for 'on-failure' policy */
    maximumRetryCount?: number;
  };
  /** Container labels */
  labels?: Record<string, string>;
  /** Auto-remove container after execution */
  autoRemove?: boolean;
}

/**
 * Feature flags for controlling worker behavior
 */
export interface FeatureFlags {
  /** Whether container mode is enabled */
  enableContainerMode: boolean;
  /** Default execution mode when none specified */
  defaultExecutionMode: ExecutionMode;
  /** Whether execution mode can be overridden per task */
  allowModeOverride: boolean;
  /** List of available container providers */
  containerProviders: string[];
  /** Whether to enable metrics collection */
  enableMetrics?: boolean;
  /** Whether to enable distributed tracing */
  enableTracing?: boolean;
  /** Whether to enable experimental features */
  enableExperimentalFeatures?: boolean;
  /** Whether to enable task result caching */
  enableResultCaching?: boolean;
  /** Whether to enable automatic scaling */
  enableAutoScaling?: boolean;
  /** Whether to enable load balancing */
  enableLoadBalancing?: boolean;
}

/**
 * Monitoring and observability configuration
 */
export interface MonitoringConfig {
  /** Whether monitoring is enabled */
  enabled: boolean;
  /** Metrics collection settings */
  metrics?: {
    /** Metrics endpoint path */
    endpoint: string;
    /** Collection interval in seconds */
    interval: number;
    /** Whether to enable system metrics */
    enableSystemMetrics: boolean;
    /** Whether to enable application metrics */
    enableApplicationMetrics: boolean;
  };
  /** Logging configuration */
  logging?: {
    /** Log level */
    level: 'error' | 'warn' | 'info' | 'debug' | 'trace';
    /** Log format */
    format: 'json' | 'text';
    /** Whether to enable structured logging */
    structured: boolean;
    /** Log output destinations */
    outputs: ('console' | 'file' | 'syslog')[];
    /** Log file path (when file output enabled) */
    filePath?: string;
    /** Maximum log file size in bytes */
    maxFileSize?: number;
    /** Number of log files to retain */
    maxFiles?: number;
  };
  /** Health check configuration */
  healthCheck?: {
    /** Health check endpoint path */
    endpoint: string;
    /** Health check interval in seconds */
    interval: number;
    /** Whether to enable deep health checks */
    enableDeepChecks: boolean;
  };
}

/**
 * Extended Worker Server Configuration
 * 
 * This interface defines configuration specifically for the worker server,
 * extending beyond the core WorkerConfig to include server-specific settings.
 */
export interface WorkerServerConfig {
  // Core server configuration
  /** Server host address */
  readonly host: string;
  /** Server port */
  readonly port: number;
  /** Maximum number of concurrent tasks */
  readonly maxConcurrentTasks: number;
  
  // Execution configuration
  /** Selected execution mode */
  readonly executionMode: ExecutionMode;
  /** Session timeout in milliseconds */
  readonly sessionTimeout: number;
  /** Whether to enable agentic execution mode */
  readonly enableAgenticMode: boolean;
  
  // Mode-specific configurations (optional, based on execution mode)
  /** Process pool configuration (when using PROCESS_POOL mode) */
  readonly processPool?: ProcessPoolConfig;
  /** Container configuration (when using CONTAINER_AGENTIC mode) */
  readonly container?: ContainerConfig;
  
  // Feature and behavior control
  /** Feature flags for controlling worker behavior */
  readonly featureFlags?: FeatureFlags;
  
  // Monitoring and observability
  /** Monitoring configuration */
  readonly monitoring?: MonitoringConfig;
  
  // Server behavior
  /** Whether health checks are enabled */
  readonly enableHealthCheck: boolean;
  /** Whether metrics collection is enabled */
  readonly enableMetrics: boolean;
  /** Request timeout in milliseconds */
  readonly requestTimeout: number;
  
  // Security settings
  /** CORS origins configuration */
  readonly corsOrigin?: string | string[];
  /** Rate limiting configuration */
  readonly rateLimit?: {
    /** Maximum requests per window */
    max: number;
    /** Window size in milliseconds */
    windowMs: number;
    /** Message for rate limit exceeded */
    message: string;
  };
  
  // API credentials (sensitive, typically from environment)
  /** Claude API key for authentication */
  readonly claudeApiKey?: string;
}

/**
 * Legacy WorkerConfig for backward compatibility
 * 
 * This maintains compatibility with existing code while providing
 * the extended configuration schema requested in the task.
 */
export interface WorkerConfig extends WorkerServerConfig {
  // Maintain all properties from WorkerServerConfig
}

/**
 * Default configuration for process pool execution mode
 */
export const defaultProcessPoolConfig: WorkerServerConfig = {
  host: '0.0.0.0',
  port: 3001,
  maxConcurrentTasks: 5,
  executionMode: ExecutionMode.PROCESS_POOL,
  sessionTimeout: 300000, // 5 minutes
  enableAgenticMode: false,
  enableHealthCheck: true,
  enableMetrics: true,
  requestTimeout: 300000, // 5 minutes
  processPool: {
    maxProcesses: 5,
    processTimeout: 300000, // 5 minutes
    claudeCodePath: process.env.CLAUDE_CODE_PATH || '/usr/local/bin/claude',
    environmentVariables: {
      NODE_ENV: process.env.NODE_ENV || 'development',
    },
    reuseProcesses: true,
    warmup: {
      preInitCount: 2,
      enabled: true,
    },
  },
  featureFlags: {
    enableContainerMode: false,
    defaultExecutionMode: ExecutionMode.PROCESS_POOL,
    allowModeOverride: false,
    containerProviders: [],
    enableMetrics: true,
    enableTracing: false,
    enableExperimentalFeatures: false,
    enableResultCaching: true,
    enableAutoScaling: false,
    enableLoadBalancing: false,
  },
  monitoring: {
    enabled: true,
    metrics: {
      endpoint: '/metrics',
      interval: 30,
      enableSystemMetrics: true,
      enableApplicationMetrics: true,
    },
    logging: {
      level: 'info',
      format: 'json',
      structured: true,
      outputs: ['console'],
    },
    healthCheck: {
      endpoint: '/health',
      interval: 30,
      enableDeepChecks: false,
    },
  },
  claudeApiKey: process.env.CLAUDE_API_KEY,
};

/**
 * Default configuration for container-based execution mode
 */
export const defaultContainerConfig: WorkerServerConfig = {
  host: '0.0.0.0',
  port: 3001,
  maxConcurrentTasks: 10,
  executionMode: ExecutionMode.CONTAINER_AGENTIC,
  sessionTimeout: 600000, // 10 minutes
  enableAgenticMode: true,
  enableHealthCheck: true,
  enableMetrics: true,
  requestTimeout: 600000, // 10 minutes
  container: {
    orchestrator: 'docker',
    image: 'ghcr.io/anthropics/claude-code:latest',
    registry: 'ghcr.io',
    resourceLimits: {
      memory: 4 * 1024 * 1024 * 1024, // 4GB
      cpu: 2,
      timeout: 3600, // 1 hour
      diskSize: 10 * 1024 * 1024 * 1024, // 10GB
    },
    network: {
      mode: 'bridge',
    },
    security: {
      runAsUser: 1000,
      runAsGroup: 1000,
      privileged: false,
      capAdd: [],
      capDrop: ['ALL'],
    },
    environmentVariables: {
      NODE_ENV: process.env.NODE_ENV || 'production',
      CLAUDE_API_KEY: process.env.CLAUDE_API_KEY || '',
    },
    healthCheck: {
      command: ['curl', '-f', 'http://localhost:3001/health'],
      interval: 30,
      timeout: 10,
      retries: 3,
      startPeriod: 60,
    },
    restartPolicy: {
      name: 'unless-stopped',
    },
    autoRemove: true,
    labels: {
      'claudecluster.component': 'worker',
      'claudecluster.mode': 'container',
    },
  },
  featureFlags: {
    enableContainerMode: true,
    defaultExecutionMode: ExecutionMode.CONTAINER_AGENTIC,
    allowModeOverride: true,
    containerProviders: ['docker', 'kubernetes', 'ecs'],
    enableMetrics: true,
    enableTracing: true,
    enableExperimentalFeatures: false,
    enableResultCaching: true,
    enableAutoScaling: true,
    enableLoadBalancing: true,
  },
  monitoring: {
    enabled: true,
    metrics: {
      endpoint: '/metrics',
      interval: 15,
      enableSystemMetrics: true,
      enableApplicationMetrics: true,
    },
    logging: {
      level: 'info',
      format: 'json',
      structured: true,
      outputs: ['console', 'file'],
      filePath: '/var/log/claudecluster-worker.log',
      maxFileSize: 100 * 1024 * 1024, // 100MB
      maxFiles: 5,
    },
    healthCheck: {
      endpoint: '/health',
      interval: 15,
      enableDeepChecks: true,
    },
  },
  corsOrigin: ['*'],
  rateLimit: {
    max: 100,
    windowMs: 15 * 60 * 1000, // 15 minutes
    message: 'Too many requests, please try again later.',
  },
  claudeApiKey: process.env.CLAUDE_API_KEY,
};

/**
 * Configuration validation utilities
 */
export class ConfigurationValidator {
  /**
   * Validate a WorkerServerConfig instance
   */
  static validateWorkerServerConfig(config: WorkerServerConfig): string[] {
    const errors: string[] = [];
    
    // Validate basic configuration
    if (!config.port || config.port < 1 || config.port > 65535) {
      errors.push('Port must be between 1 and 65535');
    }
    
    if (!config.host || config.host.trim().length === 0) {
      errors.push('Host must be specified');
    }
    
    if (!config.maxConcurrentTasks || config.maxConcurrentTasks < 1) {
      errors.push('maxConcurrentTasks must be greater than 0');
    }
    
    if (!Object.values(ExecutionMode).includes(config.executionMode)) {
      errors.push(`Invalid execution mode: ${config.executionMode}`);
    }
    
    // Validate session timeout
    if (config.sessionTimeout && config.sessionTimeout < 1000) {
      errors.push('sessionTimeout must be at least 1000ms');
    }
    
    // Validate mode-specific configuration
    if (config.executionMode === ExecutionMode.PROCESS_POOL) {
      if (config.processPool) {
        errors.push(...this.validateProcessPoolConfig(config.processPool));
      } else {
        errors.push('Process pool configuration is required when using PROCESS_POOL mode');
      }
    }
    
    if (config.executionMode === ExecutionMode.CONTAINER_AGENTIC) {
      if (config.container) {
        errors.push(...this.validateContainerConfig(config.container));
      } else {
        errors.push('Container configuration is required when using CONTAINER_AGENTIC mode');
      }
    }
    
    return errors;
  }
  
  /**
   * Validate a WorkerConfig instance (backward compatibility)
   */
  static validateWorkerConfig(config: WorkerConfig): string[] {
    return this.validateWorkerServerConfig(config);
  }
  
  /**
   * Validate ProcessPoolConfig
   */
  static validateProcessPoolConfig(config: ProcessPoolConfig): string[] {
    const errors: string[] = [];
    
    if (!config.maxProcesses || config.maxProcesses < 1) {
      errors.push('maxProcesses must be greater than 0');
    }
    
    if (!config.processTimeout || config.processTimeout < 1000) {
      errors.push('processTimeout must be at least 1000ms');
    }
    
    if (!config.claudeCodePath || config.claudeCodePath.trim().length === 0) {
      errors.push('claudeCodePath must be specified');
    }
    
    return errors;
  }
  
  /**
   * Validate ContainerConfig
   */
  static validateContainerConfig(config: ContainerConfig): string[] {
    const errors: string[] = [];
    
    const validOrchestrators = ['docker', 'kubernetes', 'ecs'];
    if (!validOrchestrators.includes(config.orchestrator)) {
      errors.push(`Invalid orchestrator: ${config.orchestrator}. Must be one of: ${validOrchestrators.join(', ')}`);
    }
    
    if (!config.image || config.image.trim().length === 0) {
      errors.push('Container image must be specified');
    }
    
    if (!config.registry || config.registry.trim().length === 0) {
      errors.push('Container registry must be specified');
    }
    
    errors.push(...this.validateResourceLimits(config.resourceLimits));
    
    return errors;
  }
  
  /**
   * Validate ResourceLimits
   */
  static validateResourceLimits(limits: ResourceLimits): string[] {
    const errors: string[] = [];
    
    if (!limits.memory || limits.memory < 128 * 1024 * 1024) { // 128MB minimum
      errors.push('Memory limit must be at least 128MB');
    }
    
    if (!limits.cpu || limits.cpu < 0.1) {
      errors.push('CPU limit must be at least 0.1 cores');
    }
    
    if (!limits.timeout || limits.timeout < 30) {
      errors.push('Timeout must be at least 30 seconds');
    }
    
    return errors;
  }
}

/**
 * Configuration factory for creating configurations based on environment
 */
export class ConfigurationFactory {
  /**
   * Create a configuration based on execution mode and environment
   */
  static createConfiguration(
    mode: ExecutionMode,
    environment: 'development' | 'staging' | 'production' = 'development'
  ): WorkerServerConfig {
    const baseConfig = mode === ExecutionMode.PROCESS_POOL
      ? { ...defaultProcessPoolConfig }
      : { ...defaultContainerConfig };
      
    // Apply environment-specific overrides
    switch (environment) {
      case 'development':
        return {
          ...baseConfig,
          monitoring: {
            ...baseConfig.monitoring,
            logging: {
              ...baseConfig.monitoring?.logging,
              level: 'debug',
              format: baseConfig.monitoring?.logging?.format || 'json',
              structured: baseConfig.monitoring?.logging?.structured !== false,
              outputs: baseConfig.monitoring?.logging?.outputs || ['console'],
            },
          },
        };
        
      case 'staging':
        return {
          ...baseConfig,
          monitoring: {
            ...baseConfig.monitoring,
            logging: {
              ...baseConfig.monitoring?.logging,
              level: 'info',
              format: baseConfig.monitoring?.logging?.format || 'json',
              structured: baseConfig.monitoring?.logging?.structured !== false,
              outputs: baseConfig.monitoring?.logging?.outputs || ['console'],
            },
          },
        };
        
      case 'production':
        return {
          ...baseConfig,
          monitoring: {
            ...baseConfig.monitoring,
            logging: {
              ...baseConfig.monitoring?.logging,
              level: 'warn',
              format: baseConfig.monitoring?.logging?.format || 'json',
              structured: baseConfig.monitoring?.logging?.structured !== false,
              outputs: baseConfig.monitoring?.logging?.outputs || ['console'],
            },
          },
        };
        
      default:
        return baseConfig;
    }
  }
  
  /**
   * Create configuration from environment variables
   */
  static createFromEnvironment(): WorkerServerConfig {
    const mode = (process.env.EXECUTION_MODE as ExecutionMode) || ExecutionMode.PROCESS_POOL;
    const environment = (process.env.NODE_ENV as 'development' | 'staging' | 'production') || 'development';
    
    const config = this.createConfiguration(mode, environment);
    
    // Override with environment variables
    if (process.env.PORT) {
      config.port = parseInt(process.env.PORT, 10);
    }
    
    if (process.env.HOST) {
      config.host = process.env.HOST;
    }
    
    if (process.env.MAX_CONCURRENT_TASKS) {
      config.maxConcurrentTasks = parseInt(process.env.MAX_CONCURRENT_TASKS, 10);
    }
    
    if (process.env.CLAUDE_API_KEY) {
      config.claudeApiKey = process.env.CLAUDE_API_KEY;
    }
    
    return config;
  }
}

/**
 * Type guards for configuration validation
 */
export function isProcessPoolConfig(config: WorkerServerConfig): config is WorkerServerConfig & { processPool: ProcessPoolConfig } {
  return config.executionMode === ExecutionMode.PROCESS_POOL && !!config.processPool;
}

export function isContainerConfig(config: WorkerServerConfig): config is WorkerServerConfig & { container: ContainerConfig } {
  return config.executionMode === ExecutionMode.CONTAINER_AGENTIC && !!config.container;
}

/**
 * Legacy type guards for backward compatibility
 */
export function isProcessPoolWorkerConfig(config: WorkerConfig): config is WorkerConfig & { processPool: ProcessPoolConfig } {
  return isProcessPoolConfig(config);
}

export function isContainerWorkerConfig(config: WorkerConfig): config is WorkerConfig & { container: ContainerConfig } {
  return isContainerConfig(config);
}

/**
 * Default export for convenience
 */
export default {
  ExecutionMode,
  defaultProcessPoolConfig,
  defaultContainerConfig,
  ConfigurationValidator,
  ConfigurationFactory,
  isProcessPoolConfig,
  isContainerConfig,
};