#!/usr/bin/env node

/**
 * Main CLI entry point for ClaudeCluster
 */

import { Command } from 'commander';
import { createInitCommand } from './commands/init.js';
import { createRunCommand } from './commands/run.js';
import { createStatusCommand } from './commands/status.js';

const program = new Command();

program
  .name('claudecluster')
  .description('ClaudeCluster - Orchestrate coding tasks with multiple Claude instances')
  .version('0.1.0');

program.addCommand(createInitCommand());
program.addCommand(createRunCommand());
program.addCommand(createStatusCommand());

program.parse();