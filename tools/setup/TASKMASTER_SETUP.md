# 🎯 Task Master AI Setup Guide for ClaudeCluster

## Overview

Task Master AI is an intelligent project management system specifically designed for ClaudeCluster. It provides:

- **AI-Powered Task Management**: Intelligent task planning and coordination
- **Parallel Development Support**: Built for managing multiple Claude Code instances
- **Real-time Dashboard**: Live project metrics and progress tracking
- **RESTful API**: Full API for integration with other tools
- **Web Interface**: Beautiful, responsive dashboard

## 🚀 Quick Start

### 1. Prerequisites

- Node.js 18+ and npm
- Git (for version control)

### 2. Installation

```bash
# Clone the repository (if not already done)
git clone https://github.com/moshinhashmi/claudecluster.git
cd claudecluster

# Install dependencies
npm install

# Run the setup script
node setup.js

# Start Task Master AI
npm run taskmaster
```

### 3. Access the System

- **Web Dashboard**: http://localhost:3000
- **API Dashboard**: http://localhost:3000/api/dashboard
- **Health Check**: http://localhost:3000/api/health
- **Configuration**: http://localhost:3000/config

## 🏗️ Architecture

### Core Components

1. **Configuration System** (`taskmaster.config.js`)
   - Project settings and metadata
   - AI model configuration
   - Task categories and priorities
   - Workflow templates

2. **API Server** (`taskmaster.js`)
   - Express.js REST API
   - Task CRUD operations
   - Dashboard metrics
   - Health monitoring

3. **Web Interface** (`public/index.html`)
   - Responsive dashboard
   - Real-time updates
   - Task visualization

4. **Setup Script** (`setup.js`)
   - Directory structure creation
   - Sample data generation
   - Environment configuration

## 📊 Features

### Task Management
- Create, read, update, delete tasks
- Assign priorities and categories
- Track progress and dependencies
- Add comments and attachments

### Dashboard
- Project overview metrics
- Category breakdown
- Priority distribution
- Recent task activity

### AI Integration
- Claude 3.5 Sonnet integration
- Intelligent task planning
- Workflow optimization
- Progress insights

### API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/tasks` | List all tasks |
| POST | `/api/tasks` | Create new task |
| GET | `/api/tasks/:id` | Get task by ID |
| PUT | `/api/tasks/:id` | Update task |
| DELETE | `/api/tasks/:id` | Delete task |
| POST | `/api/tasks/:id/comments` | Add comment |
| PATCH | `/api/tasks/:id/progress` | Update progress |
| GET | `/api/dashboard` | Get dashboard data |
| GET | `/api/config` | Get configuration |
| GET | `/api/health` | Health check |

## ⚙️ Configuration

### Environment Variables

Create a `.env` file in the project root:

```env
NODE_ENV=development
PORT=3000
JWT_SECRET=your-secret-key
SESSION_SECRET=your-session-secret
LOG_LEVEL=info
LOG_FILE=logs/taskmaster.log
```

### Task Categories

Default categories in `taskmaster.config.js`:

- **Architecture**: High-level system design
- **Core Development**: Main implementation
- **Testing**: Quality assurance
- **Documentation**: Docs and guides
- **DevOps**: CI/CD and infrastructure
- **Research**: Investigation and RFCs

### Priorities

- **Critical**: Blocking development
- **High**: Important for next milestone
- **Medium**: Normal development
- **Low**: Nice to have
- **Backlog**: Future consideration

## 🔧 Development

### Available Scripts

```bash
# Start Task Master AI
npm run taskmaster

# Development mode with auto-reload
npm run taskmaster:dev

# Run tests
npm test

# Lint code
npm run lint

# Format code
npm run format

# Setup project
npm run setup
```

### Project Structure

```
claudecluster/
├── taskmaster.config.js    # Main configuration
├── taskmaster.js          # API server
├── setup.js               # Setup script
├── package.json           # Dependencies
├── .env                   # Environment variables
├── public/                # Web interface
│   └── index.html        # Dashboard
├── src/                   # Source code (future)
├── tests/                 # Test files
├── data/                  # Data storage
├── logs/                  # Log files
└── TASKMASTER_README.md   # This file
```

## 📈 Usage Examples

### Creating a Task via API

```bash
curl -X POST http://localhost:3000/api/tasks \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Implement Worker Communication",
    "description": "Build the communication layer between Driver and Workers",
    "category": "Core Development",
    "priority": "High",
    "estimatedTime": "4-6 hours"
  }'
```

### Updating Task Progress

```bash
curl -X PATCH http://localhost:3000/api/tasks/1/progress \
  -H "Content-Type: application/json" \
  -d '{"progress": 75}'
```

### Adding a Comment

```bash
curl -X POST http://localhost:3000/api/tasks/1/comments \
  -H "Content-Type: application/json" \
  -d '{
    "author": "Developer",
    "content": "Completed the basic communication protocol"
  }'
```

## 🧪 Testing

### Run Tests

```bash
# Run all tests
npm test

# Watch mode
npm run test:watch

# Coverage report
npm test -- --coverage
```

### Test Structure

- **Unit Tests**: Individual component testing
- **Integration Tests**: API endpoint testing
- **Test Utilities**: Common test helpers

## 🚀 Deployment

### Production Considerations

1. **Environment Variables**
   - Set production values
   - Use strong secrets
   - Configure logging

2. **Database Integration**
   - Replace in-memory storage
   - Add PostgreSQL/MongoDB
   - Implement data persistence

3. **Security**
   - Enable HTTPS
   - Add authentication
   - Rate limiting
   - CORS configuration

4. **Monitoring**
   - Health checks
   - Metrics collection
   - Error tracking
   - Performance monitoring

## 🔌 Integrations

### GitHub Integration

Configure in `taskmaster.config.js`:

```javascript
integrations: {
  github: {
    enabled: true,
    repository: "moshinhashmi/claudecluster",
    autoSync: true,
    createIssues: true,
    linkCommits: true
  }
}
```

### Slack Integration

```javascript
integrations: {
  slack: {
    enabled: true,
    webhookUrl: process.env.SLACK_WEBHOOK_URL
  }
}
```

## 📝 Customization

### Adding New Categories

Edit `taskmaster.config.js`:

```javascript
categories: [
  // ... existing categories
  {
    name: "Security",
    description: "Security-related tasks and audits",
    color: "#FF6B6B"
  }
]
```

### Creating Workflow Templates

```javascript
templates: [
  // ... existing templates
  {
    name: "Security Review",
    description: "Complete security review process",
    steps: [
      "Code security scan",
      "Dependency audit",
      "Penetration testing",
      "Security documentation"
    ],
    estimatedTime: "2-3 hours",
    priority: "high"
  }
]
```

## 🐛 Troubleshooting

### Common Issues

1. **Port Already in Use**
   ```bash
   # Change port in .env file
   PORT=3001
   ```

2. **Dependencies Not Found**
   ```bash
   # Reinstall dependencies
   rm -rf node_modules package-lock.json
   npm install
   ```

3. **Permission Denied**
   ```bash
   # Check file permissions
   chmod +x taskmaster.js setup.js
   ```

### Logs

Check logs in the `logs/` directory:

```bash
tail -f logs/taskmaster.log
```

## 🤝 Contributing

### Development Workflow

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests
5. Submit a pull request

### Code Standards

- Use ESLint configuration
- Follow Prettier formatting
- Write comprehensive tests
- Update documentation

## 📚 Resources

- [Express.js Documentation](https://expressjs.com/)
- [Claude API Documentation](https://docs.anthropic.com/)
- [Node.js Best Practices](https://github.com/goldbergyoni/nodebestpractices)

## 📄 License

This project is licensed under the Apache License, Version 2.0. See the `LICENSE` file for details.

---

## 🎯 Next Steps

1. **Explore the Dashboard**: Visit http://localhost:3000
2. **Create Sample Tasks**: Use the API to add tasks
3. **Customize Configuration**: Modify `taskmaster.config.js`
4. **Integrate with Claude**: Connect to Claude API
5. **Scale Up**: Add database and authentication

Happy task managing! 🚀
