/**
 * Type definitions for CLI
 */

export interface CliConfig {
  defaultRunner: string;
  drivers: DriverConfig[];
  logging: LoggingConfig;
}

export interface DriverConfig {
  id: string;
  endpoint: string;
  maxWorkers: number;
}

export interface LoggingConfig {
  level: 'debug' | 'info' | 'warn' | 'error';
  file?: string;
}