# Task Master AI for ClaudeCluster

This directory contains the Task Master AI setup for managing and orchestrating ClaudeCluster development tasks.

## Quick Start

1. Install dependencies:
   ```bash
   npm install
   ```

2. Start the Task Master AI server:
   ```bash
   npm run taskmaster
   ```

3. Access the dashboard:
   - Dashboard: http://localhost:3000/api/dashboard
   - API Health: http://localhost:3000/api/health
   - Configuration: http://localhost:3000/config

## API Endpoints

- `GET /api/tasks` - List all tasks
- `POST /api/tasks` - Create new task
- `GET /api/tasks/:id` - Get task by ID
- `PUT /api/tasks/:id` - Update task
- `DELETE /api/tasks/:id` - Delete task
- `POST /api/tasks/:id/comments` - Add comment to task
- `PATCH /api/tasks/:id/progress` - Update task progress
- `GET /api/dashboard` - Get project dashboard
- `GET /api/config` - Get configuration

## Configuration

Edit `taskmaster.config.js` to customize:
- Task categories and priorities
- Workflow templates
- AI model settings
- Integration options

## Development

- `npm run taskmaster:dev` - Start with auto-reload
- `npm test` - Run tests
- `npm run lint` - Check code quality
- `npm run format` - Format code

## Sample Data

Sample tasks are loaded from `data/sample-tasks.json` to help you get started.
