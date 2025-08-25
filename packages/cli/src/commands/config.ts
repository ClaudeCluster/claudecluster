/**
 * @fileoverview Configuration management commands
 */

import inquirer from 'inquirer';
import { BaseCommand, createContext, addCommonOptions } from './base.js';
import type { CommandResult, CLIConfig } from '../types/index.js';
import { 
  loadConfig, 
  saveConfig, 
  validateConfig, 
  createResult, 
  printSuccess, 
  printError, 
  printWarning 
} from '../utils/index.js';

/**
 * Configuration view command
 */
export class ConfigViewCommand extends BaseCommand {
  async execute(): Promise<CommandResult> {
    try {
      const config = await loadConfig();
      
      return createResult(true, {
        configuration: {
          defaultDriverUrl: config.defaultDriverUrl,
          defaultMCPUrl: config.defaultMCPUrl,
          defaultOutputFormat: config.defaultOutputFormat,
          defaultTimeout: `${config.defaultTimeout}ms`,
          enableColors: config.enableColors,
          enableProgressBars: config.enableProgressBars,
          configFile: config.configFile || 'Default location'
        }
      });
    } catch (error) {
      return createResult(false, undefined, error instanceof Error ? error.message : String(error));
    }
  }
}

/**
 * Configuration set command
 */
export class ConfigSetCommand extends BaseCommand {
  async execute(key: string, value: string): Promise<CommandResult> {
    try {
      const currentConfig = await loadConfig();
      const updates: Partial<CLIConfig> = {};
      
      // Parse and validate the key-value pair
      switch (key) {
        case 'defaultDriverUrl':
        case 'driver-url':
          updates.defaultDriverUrl = value;
          break;
          
        case 'defaultMCPUrl':
        case 'mcp-url':
          updates.defaultMCPUrl = value;
          break;
          
        case 'defaultOutputFormat':
        case 'output-format':
          if (!['json', 'yaml', 'table', 'text'].includes(value)) {
            return createResult(false, undefined, 'Invalid output format. Must be: json, yaml, table, or text');
          }
          updates.defaultOutputFormat = value as any;
          break;
          
        case 'defaultTimeout':
        case 'timeout':
          const timeout = parseInt(value);
          if (isNaN(timeout) || timeout < 1000) {
            return createResult(false, undefined, 'Timeout must be a number >= 1000 (milliseconds)');
          }
          updates.defaultTimeout = timeout;
          break;
          
        case 'enableColors':
        case 'colors':
          updates.enableColors = value.toLowerCase() === 'true';
          break;
          
        case 'enableProgressBars':
        case 'progress':
          updates.enableProgressBars = value.toLowerCase() === 'true';
          break;
          
        default:
          return createResult(false, undefined, `Unknown configuration key: ${key}`);
      }
      
      // Validate configuration
      const validation = validateConfig(updates);
      if (!validation.valid) {
        return createResult(false, undefined, `Configuration invalid: ${validation.errors.join(', ')}`);
      }
      
      // Save configuration
      await saveConfig(updates);
      
      const result: any = {
        message: `Configuration updated: ${key} = ${value}`
      };
      
      if (validation.warnings.length > 0) {
        result.warnings = validation.warnings;
      }
      
      return createResult(true, result, undefined, validation.warnings);
    } catch (error) {
      return createResult(false, undefined, error instanceof Error ? error.message : String(error));
    }
  }
}

/**
 * Configuration reset command
 */
export class ConfigResetCommand extends BaseCommand {
  async execute(key?: string): Promise<CommandResult> {
    try {
      if (key) {
        // Reset specific key
        const currentConfig = await loadConfig();
        const updates: Partial<CLIConfig> = { ...currentConfig };
        
        switch (key) {
          case 'defaultDriverUrl':
          case 'driver-url':
            updates.defaultDriverUrl = 'http://localhost:3002';
            break;
          case 'defaultMCPUrl':
          case 'mcp-url':
            updates.defaultMCPUrl = 'http://localhost:3100';
            break;
          case 'defaultOutputFormat':
          case 'output-format':
            updates.defaultOutputFormat = 'table';
            break;
          case 'defaultTimeout':
          case 'timeout':
            updates.defaultTimeout = 300000;
            break;
          case 'enableColors':
          case 'colors':
            updates.enableColors = true;
            break;
          case 'enableProgressBars':
          case 'progress':
            updates.enableProgressBars = true;
            break;
          default:
            return createResult(false, undefined, `Unknown configuration key: ${key}`);
        }
        
        await saveConfig(updates);
        
        return createResult(true, {
          message: `Configuration key '${key}' reset to default value`
        });
      } else {
        // Reset all configuration
        const { DEFAULT_CLI_CONFIG } = await import('../utils/index.js');
        await saveConfig(DEFAULT_CLI_CONFIG);
        
        return createResult(true, {
          message: 'All configuration reset to default values'
        });
      }
    } catch (error) {
      return createResult(false, undefined, error instanceof Error ? error.message : String(error));
    }
  }
}

/**
 * Interactive configuration command
 */
export class ConfigWizardCommand extends BaseCommand {
  async execute(): Promise<CommandResult> {
    try {
      const currentConfig = await loadConfig();
      
      console.log('🔧 ClaudeCluster Configuration Wizard\n');
      
      const questions = [
        {
          type: 'input',
          name: 'defaultDriverUrl',
          message: 'Driver server URL:',
          default: currentConfig.defaultDriverUrl,
          validate: (input: string) => {
            try {
              new URL(input);
              return true;
            } catch {
              return 'Please enter a valid URL';
            }
          }
        },
        {
          type: 'input',
          name: 'defaultMCPUrl',
          message: 'MCP server URL:',
          default: currentConfig.defaultMCPUrl,
          validate: (input: string) => {
            try {
              new URL(input);
              return true;
            } catch {
              return 'Please enter a valid URL';
            }
          }
        },
        {
          type: 'list',
          name: 'defaultOutputFormat',
          message: 'Default output format:',
          choices: [
            { name: 'Table (human-readable)', value: 'table' },
            { name: 'JSON (structured)', value: 'json' },
            { name: 'YAML (structured)', value: 'yaml' },
            { name: 'Text (plain)', value: 'text' }
          ],
          default: currentConfig.defaultOutputFormat
        },
        {
          type: 'input',
          name: 'defaultTimeout',
          message: 'Default timeout (seconds):',
          default: Math.floor(currentConfig.defaultTimeout / 1000),
          filter: (input: string) => parseInt(input) * 1000,
          validate: (input: string) => {
            const num = parseInt(input);
            return !isNaN(num) && num >= 1 ? true : 'Please enter a valid number >= 1';
          }
        },
        {
          type: 'confirm',
          name: 'enableColors',
          message: 'Enable colored output:',
          default: currentConfig.enableColors
        },
        {
          type: 'confirm',
          name: 'enableProgressBars',
          message: 'Enable progress bars:',
          default: currentConfig.enableProgressBars
        }
      ];
      
      const answers = await inquirer.prompt(questions);
      
      // Validate configuration
      const validation = validateConfig(answers);
      
      if (!validation.valid) {
        printError('Configuration validation failed', validation.errors.join('\n'));
        return createResult(false, undefined, validation.errors.join(', '));
      }
      
      if (validation.warnings.length > 0) {
        printWarning('Configuration warnings', validation.warnings.join('\n'));
      }
      
      // Save configuration
      await saveConfig(answers);
      
      printSuccess('Configuration saved successfully!', 'Your preferences have been updated.');
      
      return createResult(true, {
        message: 'Configuration updated successfully',
        configuration: answers
      }, undefined, validation.warnings);
      
    } catch (error) {
      return createResult(false, undefined, error instanceof Error ? error.message : String(error));
    }
  }
}

/**
 * Add configuration commands to program
 */
export function addConfigCommands(program: any): void {
  const configCommand = program
    .command('config')
    .description('Configuration management commands');
  
  // View configuration
  const viewCommand = configCommand
    .command('view')
    .alias('show')
    .description('View current configuration')
    .action(async (options: any) => {
      const context = await createContext(options);
      const command = new ConfigViewCommand(context);
      const result = await command.execute();
      command.outputResult(result);
    });
  
  addCommonOptions(viewCommand);
  
  // Set configuration
  const setCommand = configCommand
    .command('set <key> <value>')
    .description('Set configuration value')
    .action(async (key: string, value: string, options: any) => {
      const context = await createContext(options);
      const command = new ConfigSetCommand(context);
      const result = await command.execute(key, value);
      command.outputResult(result);
    });
  
  addCommonOptions(setCommand);
  
  // Reset configuration
  const resetCommand = configCommand
    .command('reset [key]')
    .description('Reset configuration to defaults')
    .action(async (key: string, options: any) => {
      const context = await createContext(options);
      const command = new ConfigResetCommand(context);
      const result = await command.execute(key);
      command.outputResult(result);
    });
  
  addCommonOptions(resetCommand);
  
  // Configuration wizard
  const wizardCommand = configCommand
    .command('wizard')
    .alias('init')
    .description('Interactive configuration wizard')
    .action(async (options: any) => {
      const context = await createContext(options);
      const command = new ConfigWizardCommand(context);
      const result = await command.execute();
      
      // Don't use outputResult here as wizard handles its own output
      if (!result.success) {
        printError(result.error || 'Configuration wizard failed');
        process.exit(1);
      }
    });
  
  addCommonOptions(wizardCommand);
  
  // Configuration validation
  configCommand
    .command('validate')
    .description('Validate current configuration')
    .action(async (options: any) => {
      try {
        const config = await loadConfig();
        const validation = validateConfig(config);
        
        if (validation.valid) {
          printSuccess('Configuration is valid', 
            validation.warnings.length > 0 
              ? `Warnings:\n${validation.warnings.join('\n')}` 
              : undefined
          );
        } else {
          printError('Configuration is invalid', validation.errors.join('\n'));
          process.exit(1);
        }
      } catch (error) {
        printError('Failed to validate configuration', 
          error instanceof Error ? error.message : String(error)
        );
        process.exit(1);
      }
    });
}