/**
 * @fileoverview CLI utility functions
 */

import { readFile, writeFile, access, constants } from 'fs/promises';
import { join, resolve } from 'path';
import { homedir } from 'os';
import chalk from 'chalk';
import boxen from 'boxen';
import { table } from 'table';
import yaml from 'yaml';
import type { OutputFormat, CLIConfig, CommandResult, ConfigValidation } from '../types/index.js';

/**
 * Default CLI configuration
 */
export const DEFAULT_CLI_CONFIG: CLIConfig = {
  defaultDriverUrl: 'http://localhost:3002',
  defaultMCPUrl: 'http://localhost:3100',
  defaultOutputFormat: 'table',
  defaultTimeout: 300000, // 5 minutes
  enableColors: true,
  enableProgressBars: true
};

/**
 * Format output based on specified format
 */
export function formatOutput(data: any, format: OutputFormat): string {
  switch (format) {
    case 'json':
      return JSON.stringify(data, null, 2);
    
    case 'yaml':
      return yaml.stringify(data);
    
    case 'table':
      return formatAsTable(data);
    
    case 'text':
      return formatAsText(data);
    
    default:
      return String(data);
  }
}

/**
 * Format data as table
 */
function formatAsTable(data: any): string {
  if (!data) return '';
  
  if (Array.isArray(data)) {
    if (data.length === 0) return 'No data available';
    
    const headers = Object.keys(data[0]);
    const rows = data.map(item => headers.map(header => String(item[header] || '')));
    
    return table([headers, ...rows], {
      border: {
        topBody: `─`,
        topJoin: `┬`,
        topLeft: `┌`,
        topRight: `┐`,
        bottomBody: `─`,
        bottomJoin: `┴`,
        bottomLeft: `└`,
        bottomRight: `┘`,
        bodyLeft: `│`,
        bodyRight: `│`,
        bodyJoin: `│`,
        joinBody: `─`,
        joinLeft: `├`,
        joinRight: `┤`,
        joinJoin: `┼`
      }
    });
  }
  
  if (typeof data === 'object') {
    const entries = Object.entries(data);
    const rows = entries.map(([key, value]) => [key, String(value)]);
    
    return table([['Property', 'Value'], ...rows], {
      border: {
        topBody: `─`,
        topJoin: `┬`,
        topLeft: `┌`,
        topRight: `┐`,
        bottomBody: `─`,
        bottomJoin: `┴`,
        bottomLeft: `└`,
        bottomRight: `┘`,
        bodyLeft: `│`,
        bodyRight: `│`,
        bodyJoin: `│`,
        joinBody: `─`,
        joinLeft: `├`,
        joinRight: `┤`,
        joinJoin: `┼`
      }
    });
  }
  
  return String(data);
}

/**
 * Format data as human-readable text
 */
function formatAsText(data: any): string {
  if (!data) return '';
  
  if (Array.isArray(data)) {
    return data.map((item, index) => {
      if (typeof item === 'object') {
        const lines = Object.entries(item).map(([key, value]) => `  ${key}: ${value}`);
        return `${index + 1}.\n${lines.join('\n')}`;
      }
      return `${index + 1}. ${item}`;
    }).join('\n\n');
  }
  
  if (typeof data === 'object') {
    return Object.entries(data)
      .map(([key, value]) => `${key}: ${value}`)
      .join('\n');
  }
  
  return String(data);
}

/**
 * Print success message
 */
export function printSuccess(message: string, details?: string): void {
  const content = details ? `${message}\n\n${details}` : message;
  console.log(boxen(chalk.green(content), {
    padding: 1,
    margin: 1,
    borderStyle: 'round',
    borderColor: 'green'
  }));
}

/**
 * Print error message
 */
export function printError(message: string, details?: string): void {
  const content = details ? `${message}\n\n${details}` : message;
  console.error(boxen(chalk.red(content), {
    padding: 1,
    margin: 1,
    borderStyle: 'round',
    borderColor: 'red'
  }));
}

/**
 * Print warning message
 */
export function printWarning(message: string, details?: string): void {
  const content = details ? `${message}\n\n${details}` : message;
  console.warn(boxen(chalk.yellow(content), {
    padding: 1,
    margin: 1,
    borderStyle: 'round',
    borderColor: 'yellow'
  }));
}

/**
 * Print info message
 */
export function printInfo(message: string, details?: string): void {
  const content = details ? `${message}\n\n${details}` : message;
  console.log(boxen(chalk.blue(content), {
    padding: 1,
    margin: 1,
    borderStyle: 'round',
    borderColor: 'blue'
  }));
}

/**
 * Get configuration file path
 */
export function getConfigPath(): string {
  return join(homedir(), '.claudecluster', 'cli-config.json');
}

/**
 * Load CLI configuration
 */
export async function loadConfig(): Promise<CLIConfig> {
  const configPath = getConfigPath();
  
  try {
    await access(configPath, constants.F_OK);
    const content = await readFile(configPath, 'utf-8');
    const userConfig = JSON.parse(content);
    
    return { ...DEFAULT_CLI_CONFIG, ...userConfig };
  } catch (error) {
    // Config file doesn't exist or is invalid, return defaults
    return DEFAULT_CLI_CONFIG;
  }
}

/**
 * Save CLI configuration
 */
export async function saveConfig(config: Partial<CLIConfig>): Promise<void> {
  const configPath = getConfigPath();
  const currentConfig = await loadConfig();
  const newConfig = { ...currentConfig, ...config };
  
  // Ensure config directory exists
  const configDir = join(homedir(), '.claudecluster');
  try {
    await access(configDir, constants.F_OK);
  } catch {
    // Directory doesn't exist, create it
    const { mkdir } = await import('fs/promises');
    await mkdir(configDir, { recursive: true });
  }
  
  await writeFile(configPath, JSON.stringify(newConfig, null, 2));
}

/**
 * Validate configuration
 */
export function validateConfig(config: Partial<CLIConfig>): ConfigValidation {
  const errors: string[] = [];
  const warnings: string[] = [];
  
  // Validate URLs
  if (config.defaultDriverUrl && !isValidUrl(config.defaultDriverUrl)) {
    errors.push('Invalid driver URL format');
  }
  
  if (config.defaultMCPUrl && !isValidUrl(config.defaultMCPUrl)) {
    errors.push('Invalid MCP URL format');
  }
  
  // Validate timeout
  if (config.defaultTimeout !== undefined && config.defaultTimeout < 1000) {
    warnings.push('Timeout is very low (< 1 second)');
  }
  
  // Validate output format
  const validFormats: OutputFormat[] = ['json', 'yaml', 'table', 'text'];
  if (config.defaultOutputFormat && !validFormats.includes(config.defaultOutputFormat)) {
    errors.push(`Invalid output format. Must be one of: ${validFormats.join(', ')}`);
  }
  
  return {
    valid: errors.length === 0,
    errors,
    warnings
  };
}

/**
 * Validate URL format
 */
function isValidUrl(url: string): boolean {
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
}

/**
 * Parse duration string to milliseconds
 */
export function parseDuration(duration: string): number {
  const match = duration.match(/^(\d+)(s|m|h|d)?$/i);
  if (!match) {
    throw new Error('Invalid duration format. Use format like: 30s, 5m, 2h, 1d');
  }
  
  const [, value, unit = 's'] = match;
  const num = parseInt(value || '0', 10);
  
  switch (unit.toLowerCase()) {
    case 's': return num * 1000;
    case 'm': return num * 60 * 1000;
    case 'h': return num * 60 * 60 * 1000;
    case 'd': return num * 24 * 60 * 60 * 1000;
    default: return num * 1000;
  }
}

/**
 * Format duration from milliseconds
 */
export function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  
  if (days > 0) return `${days}d ${hours % 24}h ${minutes % 60}m ${seconds % 60}s`;
  if (hours > 0) return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
  if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
  return `${seconds}s`;
}

/**
 * Truncate text to specified length
 */
export function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength - 3) + '...';
}

/**
 * Create a command result
 */
export function createResult<T>(
  success: boolean,
  data?: T,
  error?: string,
  warnings?: string[]
): CommandResult<T> {
  return {
    success,
    data: data as T,
    error,
    warnings,
    metadata: {
      timestamp: new Date().toISOString(),
      command: process.argv.slice(2).join(' ')
    }
  } as CommandResult<T>;
}

/**
 * Handle promise with error catching
 */
export async function handleAsync<T>(
  promise: Promise<T>,
  errorMessage: string = 'Operation failed'
): Promise<CommandResult<T>> {
  try {
    const data = await promise;
    return createResult(true, data);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return createResult<T>(false, undefined as any, `${errorMessage}: ${message}`);
  }
}

/**
 * Create spinner-like progress indicator
 */
export class ProgressIndicator {
  private spinner = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
  private currentFrame = 0;
  private interval?: NodeJS.Timeout;
  private message: string;

  constructor(message: string) {
    this.message = message;
  }

  start(): void {
    process.stdout.write('\x1B[?25l'); // Hide cursor
    this.interval = setInterval(() => {
      process.stdout.write(`\r${this.spinner[this.currentFrame]} ${this.message}`);
      this.currentFrame = (this.currentFrame + 1) % this.spinner.length;
    }, 100);
  }

  updateMessage(message: string): void {
    this.message = message;
  }

  succeed(message?: string): void {
    this.stop();
    console.log(`${chalk.green('✓')} ${message || this.message}`);
  }

  fail(message?: string): void {
    this.stop();
    console.log(`${chalk.red('✗')} ${message || this.message}`);
  }

  stop(): void {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = undefined as any;
    }
    process.stdout.write('\r\x1B[K'); // Clear line
    process.stdout.write('\x1B[?25h'); // Show cursor
  }
}

/**
 * Sleep for specified milliseconds
 */
export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Retry function with exponential backoff
 */
export async function retry<T>(
  fn: () => Promise<T>,
  maxAttempts: number = 3,
  baseDelay: number = 1000
): Promise<T> {
  let lastError: Error;
  
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      
      if (attempt === maxAttempts) {
        throw lastError;
      }
      
      const delay = baseDelay * Math.pow(2, attempt - 1);
      await sleep(delay);
    }
  }
  
  throw lastError!;
}