#!/usr/bin/env node

const readline = require('readline');
const axios = require('axios');

const API_BASE = 'http://localhost:3000/api';

// Colors for console output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m'
};

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

// Helper functions
function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function logError(message) {
  log(`❌ ${message}`, 'red');
}

function logSuccess(message) {
  log(`✅ ${message}`, 'green');
}

function logInfo(message) {
  log(`ℹ️  ${message}`, 'blue');
}

function logWarning(message) {
  log(`⚠️  ${message}`, 'yellow');
}

// API functions
async function makeRequest(method, endpoint, data = null) {
  try {
    const config = {
      method,
      url: `${API_BASE}${endpoint}`,
      headers: {
        'Content-Type': 'application/json'
      }
    };

    if (data) {
      config.data = data;
    }

    const response = await axios(config);
    return response.data;
  } catch (error) {
    if (error.response) {
      throw new Error(error.response.data.error || 'API request failed');
    }
    throw new Error('Network error - make sure Task Master AI is running');
  }
}

// CLI Commands
async function showDashboard() {
  try {
    logInfo('Loading dashboard...');
    const data = await makeRequest('GET', '/dashboard');
    
    if (data.success) {
      const { summary, categoryBreakdown, priorityBreakdown } = data.data;
      
      log('\n📊 PROJECT DASHBOARD', 'bright');
      log('=' * 50);
      
      log(`\n📈 Summary:`, 'cyan');
      log(`   Total Tasks: ${summary.total}`);
      log(`   Completed: ${summary.completed}`);
      log(`   In Progress: ${summary.inProgress}`);
      log(`   Pending: ${summary.pending}`);
      log(`   Completion Rate: ${summary.completionRate}%`);
      
      log(`\n🏷️  Categories:`, 'cyan');
      categoryBreakdown.forEach(cat => {
        log(`   ${cat.name}: ${cat.count} tasks`);
      });
      
      log(`\n⚡ Priorities:`, 'cyan');
      priorityBreakdown.forEach(pri => {
        log(`   ${pri.name}: ${pri.count} tasks`);
      });
    }
  } catch (error) {
    logError(error.message);
  }
}

async function listTasks() {
  try {
    logInfo('Loading tasks...');
    const data = await makeRequest('GET', '/tasks');
    
    if (data.success && data.data.length > 0) {
      log('\n📋 TASKS', 'bright');
      log('=' * 50);
      
      data.data.forEach((task, index) => {
        log(`\n${index + 1}. ${task.title}`, 'bright');
        log(`   Description: ${task.description}`);
        log(`   Category: ${task.category}`);
        log(`   Priority: ${task.priority}`);
        log(`   Status: ${task.status}`);
        log(`   Progress: ${task.progress}%`);
        log(`   Estimate: ${task.estimatedTime}`);
      });
    } else {
      logInfo('No tasks found. Create your first task to get started!');
    }
  } catch (error) {
    logError(error.message);
  }
}

async function createTask() {
  try {
    logInfo('Creating new task...');
    
    const title = await question('Task title: ');
    const description = await question('Task description: ');
    const category = await question('Category (Architecture/Core Development/Testing/Documentation/DevOps/Research): ');
    const priority = await question('Priority (Critical/High/Medium/Low/Backlog): ');
    const estimatedTime = await question('Estimated time (e.g., 2-4 hours): ');
    
    const taskData = {
      title,
      description,
      category: category || 'Core Development',
      priority: priority || 'Medium',
      estimatedTime: estimatedTime || '1-2 hours'
    };
    
    const data = await makeRequest('POST', '/tasks', taskData);
    
    if (data.success) {
      logSuccess('Task created successfully!');
      log(`Task ID: ${data.data.id}`);
    }
  } catch (error) {
    logError(error.message);
  }
}

async function updateTaskProgress() {
  try {
    const taskId = await question('Task ID: ');
    const progress = await question('Progress (0-100): ');
    
    if (progress < 0 || progress > 100) {
      logError('Progress must be between 0 and 100');
      return;
    }
    
    const data = await makeRequest('PATCH', `/tasks/${taskId}/progress`, { progress });
    
    if (data.success) {
      logSuccess('Task progress updated successfully!');
      log(`New status: ${data.data.status}`);
    }
  } catch (error) {
    logError(error.message);
  }
}

async function addComment() {
  try {
    const taskId = await question('Task ID: ');
    const author = await question('Your name: ');
    const content = await question('Comment: ');
    
    const commentData = { author, content };
    const data = await makeRequest('POST', `/tasks/${taskId}/comments`, commentData);
    
    if (data.success) {
      logSuccess('Comment added successfully!');
    }
  } catch (error) {
    logError(error.message);
  }
}

async function showTaskDetails() {
  try {
    const taskId = await question('Task ID: ');
    const data = await makeRequest('GET', `/tasks/${taskId}`);
    
    if (data.success) {
      const task = data.data;
      log('\n📋 TASK DETAILS', 'bright');
      log('=' * 50);
      log(`Title: ${task.title}`);
      log(`Description: ${task.description}`);
      log(`Category: ${task.category}`);
      log(`Priority: ${task.priority}`);
      log(`Status: ${task.status}`);
      log(`Progress: ${task.progress}%`);
      log(`Estimate: ${task.estimatedTime}`);
      log(`Created: ${new Date(task.createdAt).toLocaleString()}`);
      log(`Updated: ${new Date(task.updatedAt).toLocaleString()}`);
      
      if (task.comments.length > 0) {
        log('\n💬 Comments:', 'cyan');
        task.comments.forEach(comment => {
          log(`   ${comment.author} (${new Date(comment.timestamp).toLocaleString()}): ${comment.content}`);
        });
      }
    }
  } catch (error) {
    logError(error.message);
  }
}

async function showHelp() {
  log('\n🎯 TASK MASTER AI CLI', 'bright');
  log('=' * 50);
  log('\nAvailable commands:');
  log('  dashboard    - Show project dashboard');
  log('  tasks        - List all tasks');
  log('  create       - Create a new task');
  log('  progress     - Update task progress');
  log('  comment      - Add comment to task');
  log('  details      - Show task details');
  log('  help         - Show this help');
  log('  exit         - Exit the CLI');
  log('\nMake sure Task Master AI is running on http://localhost:3000');
}

// Helper function for user input
function question(query) {
  return new Promise((resolve) => {
    rl.question(query, resolve);
  });
}

// Main CLI loop
async function main() {
  log('🎯 Welcome to Task Master AI CLI!', 'bright');
  log('Type "help" to see available commands\n');
  
  while (true) {
    try {
      const command = await question('taskmaster> ');
      
      switch (command.toLowerCase().trim()) {
        case 'dashboard':
          await showDashboard();
          break;
        case 'tasks':
          await listTasks();
          break;
        case 'create':
          await createTask();
          break;
        case 'progress':
          await updateTaskProgress();
          break;
        case 'comment':
          await addComment();
          break;
        case 'details':
          await showTaskDetails();
          break;
        case 'help':
          await showHelp();
          break;
        case 'exit':
        case 'quit':
          logInfo('Goodbye! 👋');
          rl.close();
          process.exit(0);
          break;
        default:
          logWarning(`Unknown command: ${command}. Type "help" for available commands.`);
      }
      
      log(''); // Empty line for readability
    } catch (error) {
      logError('An error occurred. Please try again.');
      console.error(error);
    }
  }
}

// Handle process termination
process.on('SIGINT', () => {
  logInfo('\nGoodbye! 👋');
  rl.close();
  process.exit(0);
});

// Start CLI if this file is run directly
if (require.main === module) {
  main().catch(error => {
    logError('Fatal error:');
    console.error(error);
    process.exit(1);
  });
}

module.exports = {
  showDashboard,
  listTasks,
  createTask,
  updateTaskProgress,
  addComment,
  showTaskDetails
};
