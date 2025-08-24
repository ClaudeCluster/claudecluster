#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

console.log('🚀 Setting up Task Master AI for ClaudeCluster...\n');

// Create necessary directories
const directories = [
  'src',
  'src/api',
  'src/models',
  'src/services',
  'src/utils',
  'tests',
  'tests/unit',
  'tests/integration',
  'public',
  'logs',
  'data'
];

directories.forEach(dir => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
    console.log(`✅ Created directory: ${dir}`);
  }
});

// Create sample environment file
const envContent = `# Task Master AI Environment Configuration
NODE_ENV=development
PORT=3000

# Database (future use)
# DB_HOST=localhost
# DB_PORT=5432
# DB_NAME=taskmaster
# DB_USER=postgres
# DB_PASSWORD=

# External APIs
# SLACK_WEBHOOK_URL=
# GITHUB_TOKEN=

# Security
JWT_SECRET=your-super-secret-jwt-key-change-this-in-production
SESSION_SECRET=your-session-secret-key-change-this-in-production

# Logging
LOG_LEVEL=info
LOG_FILE=logs/taskmaster.log

# Rate Limiting
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=100
`;

if (!fs.existsSync('.env')) {
  fs.writeFileSync('.env', envContent);
  console.log('✅ Created .env file with sample configuration');
} else {
  console.log('ℹ️  .env file already exists, skipping creation');
}

// Create sample tasks data file
const sampleTasks = [
  {
    id: 1,
    title: "Design Core Architecture",
    description: "Design the fundamental architecture for ClaudeCluster including Driver-Worker communication patterns, task distribution mechanisms, and result aggregation strategies.",
    category: "Architecture",
    priority: "High",
    status: "To Do",
    assignee: null,
    estimatedTime: "4-6 hours",
    dependencies: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    progress: 0,
    comments: [],
    attachments: []
  },
  {
    id: 2,
    title: "Implement Driver Core",
    description: "Build the main Driver component that orchestrates tasks, manages worker instances, and coordinates parallel execution.",
    category: "Core Development",
    priority: "High",
    status: "To Do",
    assignee: null,
    estimatedTime: "6-8 hours",
    dependencies: ["Design Core Architecture"],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    progress: 0,
    comments: [],
    attachments: []
  },
  {
    id: 3,
    title: "Create Worker Adapter",
    description: "Develop the Worker adapter interface that allows Claude Code sessions to be managed and controlled programmatically.",
    category: "Core Development",
    priority: "High",
    status: "To Do",
    assignee: null,
    estimatedTime: "4-6 hours",
    dependencies: ["Design Core Architecture"],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    progress: 0,
    comments: [],
    attachments: []
  },
  {
    id: 4,
    title: "Setup Testing Framework",
    description: "Configure Jest testing framework, create test utilities, and establish testing patterns for the project.",
    category: "Testing",
    priority: "Medium",
    status: "To Do",
    assignee: null,
    estimatedTime: "2-3 hours",
    dependencies: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    progress: 0,
    comments: [],
    attachments: []
  },
  {
    id: 5,
    title: "Document API Design",
    description: "Create comprehensive API documentation including endpoints, request/response schemas, and usage examples.",
    category: "Documentation",
    priority: "Medium",
    status: "To Do",
    assignee: null,
    estimatedTime: "3-4 hours",
    dependencies: ["Design Core Architecture"],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    progress: 0,
    comments: [],
    attachments: []
  }
];

const dataDir = 'data';
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

fs.writeFileSync(
  path.join(dataDir, 'sample-tasks.json'),
  JSON.stringify(sampleTasks, null, 2)
);
console.log('✅ Created sample tasks data file');

// Create basic README for Task Master AI
const taskmasterReadme = `# Task Master AI for ClaudeCluster

This directory contains the Task Master AI setup for managing and orchestrating ClaudeCluster development tasks.

## Quick Start

1. Install dependencies:
   \`\`\`bash
   npm install
   \`\`\`

2. Start the Task Master AI server:
   \`\`\`bash
   npm run taskmaster
   \`\`\`

3. Access the dashboard:
   - Dashboard: http://localhost:3000/api/dashboard
   - API Health: http://localhost:3000/api/health
   - Configuration: http://localhost:3000/config

## API Endpoints

- \`GET /api/tasks\` - List all tasks
- \`POST /api/tasks\` - Create new task
- \`GET /api/tasks/:id\` - Get task by ID
- \`PUT /api/tasks/:id\` - Update task
- \`DELETE /api/tasks/:id\` - Delete task
- \`POST /api/tasks/:id/comments\` - Add comment to task
- \`PATCH /api/tasks/:id/progress\` - Update task progress
- \`GET /api/dashboard\` - Get project dashboard
- \`GET /api/config\` - Get configuration

## Configuration

Edit \`taskmaster.config.js\` to customize:
- Task categories and priorities
- Workflow templates
- AI model settings
- Integration options

## Development

- \`npm run taskmaster:dev\` - Start with auto-reload
- \`npm test\` - Run tests
- \`npm run lint\` - Check code quality
- \`npm run format\` - Format code

## Sample Data

Sample tasks are loaded from \`data/sample-tasks.json\` to help you get started.
`;

fs.writeFileSync('TASKMASTER_README.md', taskmasterReadme);
console.log('✅ Created Task Master AI README');

// Create basic test file
const testContent = `const request = require('supertest');
const app = require('../taskmaster');

describe('Task Master AI API', () => {
  describe('GET /api/health', () => {
    it('should return healthy status', async () => {
      const response = await request(app).get('/api/health');
      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.status).toBe('healthy');
    });
  });

  describe('GET /api/tasks', () => {
    it('should return empty tasks array initially', async () => {
      const response = await request(app).get('/api/tasks');
      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toEqual([]);
    });
  });

  describe('POST /api/tasks', () => {
    it('should create a new task', async () => {
      const taskData = {
        title: 'Test Task',
        description: 'This is a test task',
        category: 'Testing',
        priority: 'Medium'
      };

      const response = await request(app)
        .post('/api/tasks')
        .send(taskData);

      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.data.title).toBe(taskData.title);
      expect(response.body.data.description).toBe(taskData.description);
    });

    it('should require title and description', async () => {
      const response = await request(app)
        .post('/api/tasks')
        .send({ category: 'Testing' });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
    });
  });
});
`;

fs.writeFileSync('tests/taskmaster.test.js', testContent);
console.log('✅ Created basic test file');

// Create .gitignore entries for Task Master AI
const gitignoreEntries = `

# Task Master AI
node_modules/
.env
logs/
data/*.json
!data/sample-tasks.json
coverage/
.nyc_output/
`;

// Append to existing .gitignore
fs.appendFileSync('.gitignore', gitignoreEntries);
console.log('✅ Updated .gitignore with Task Master AI entries');

console.log('\n🎉 Task Master AI setup complete!');
console.log('\nNext steps:');
console.log('1. Run: npm install');
console.log('2. Run: npm run taskmaster');
console.log('3. Open: http://localhost:3000/api/dashboard');
console.log('\nHappy task managing! 🚀');
