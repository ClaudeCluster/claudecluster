/**
 * @fileoverview Shared utilities, configuration, and common functionality for ClaudeCluster
 * @version 0.1.0
 * @author ClaudeCluster Contributors
 */

// Configuration Management
export type { 
  BaseConfigType, 
  WorkerConfigType, 
  DriverConfigType, 
  McpConfigType 
} from './config/index.js';
export { 
  BaseConfigSchema,
  WorkerConfigSchema,
  DriverConfigSchema,
  McpConfigSchema,
  ConfigManager,
  configManager,
  loadWorkerConfig,
  loadDriverConfig,
  loadMcpConfig,
  Environment
} from './config/index.js';

// Structured Logging
export type { 
  LogContext, 
  LoggerConfig 
} from './logger/index.js';
export { 
  Logger, 
  Timer,
  LoggerFactory,
  defaultLoggerConfig
} from './logger/index.js';

// Event Handling
export type {
  EventListener,
  EventContext,
  EventSubscriptionOptions,
  EventEmissionOptions,
  EventEmitter2Options
} from './events/index.js';
export {
  EventSubscription,
  EventManager,
  EventManagerFactory
} from './events/index.js';

// Health Check and Monitoring
export type {
  HealthCheckResult,
  SystemResources,
  HealthCheckFunction,
  HealthCheckConfig,
  MonitoringThresholds
} from './health/index.js';
export {
  HealthMonitor,
  defaultThresholds,
  CommonHealthChecks
} from './health/index.js';

// Common Utilities
export * from './utils/index.js';