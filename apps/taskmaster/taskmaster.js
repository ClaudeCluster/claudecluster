#!/usr/bin/env node

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
const path = require('path');
const fs = require('fs');

// Load configuration
const config = require('./taskmaster.config.js');

// Initialize Express app
const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(helmet());
app.use(cors());
app.use(compression());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: 'Too many requests from this IP, please try again later.'
});
app.use('/api/', limiter);

// Logging
if (process.env.NODE_ENV !== 'test') {
  app.use(morgan('combined'));
}

// Task storage (in-memory for now, can be replaced with database)
let tasks = [];
let taskIdCounter = 1;

// Task Management API Routes

// Get all tasks
app.get('/api/tasks', (req, res) => {
  try {
    const { status, category, priority, assignee } = req.query;
    let filteredTasks = [...tasks];

    if (status) {
      filteredTasks = filteredTasks.filter(task => task.status === status);
    }
    if (category) {
      filteredTasks = filteredTasks.filter(task => task.category === category);
    }
    if (priority) {
      filteredTasks = filteredTasks.filter(task => task.priority === priority);
    }
    if (assignee) {
      filteredTasks = filteredTasks.filter(task => task.assignee === assignee);
    }

    res.json({
      success: true,
      data: filteredTasks,
      total: filteredTasks.length
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Get task by ID
app.get('/api/tasks/:id', (req, res) => {
  try {
    const task = tasks.find(t => t.id === parseInt(req.params.id));
    if (!task) {
      return res.status(404).json({
        success: false,
        error: 'Task not found'
      });
    }
    res.json({
      success: true,
      data: task
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Create new task
app.post('/api/tasks', (req, res) => {
  try {
    const { title, description, category, priority, assignee, estimatedTime, dependencies } = req.body;
    
    if (!title || !description) {
      return res.status(400).json({
        success: false,
        error: 'Title and description are required'
      });
    }

    const newTask = {
      id: taskIdCounter++,
      title,
      description,
      category: category || 'Core Development',
      priority: priority || 'Medium',
      status: 'To Do',
      assignee: assignee || null,
      estimatedTime: estimatedTime || '1-2 hours',
      dependencies: dependencies || [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      progress: 0,
      comments: [],
      attachments: []
    };

    tasks.push(newTask);
    
    res.status(201).json({
      success: true,
      data: newTask,
      message: 'Task created successfully'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Update task
app.put('/api/tasks/:id', (req, res) => {
  try {
    const taskIndex = tasks.findIndex(t => t.id === parseInt(req.params.id));
    if (taskIndex === -1) {
      return res.status(404).json({
        success: false,
        error: 'Task not found'
      });
    }

    const updatedTask = {
      ...tasks[taskIndex],
      ...req.body,
      updatedAt: new Date().toISOString()
    };

    tasks[taskIndex] = updatedTask;
    
    res.json({
      success: true,
      data: updatedTask,
      message: 'Task updated successfully'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Delete task
app.delete('/api/tasks/:id', (req, res) => {
  try {
    const taskIndex = tasks.findIndex(t => t.id === parseInt(req.params.id));
    if (taskIndex === -1) {
      return res.status(404).json({
        success: false,
        error: 'Task not found'
      });
    }

    const deletedTask = tasks.splice(taskIndex, 1)[0];
    
    res.json({
      success: true,
      data: deletedTask,
      message: 'Task deleted successfully'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Add comment to task
app.post('/api/tasks/:id/comments', (req, res) => {
  try {
    const { author, content } = req.body;
    const task = tasks.find(t => t.id === parseInt(req.params.id));
    
    if (!task) {
      return res.status(404).json({
        success: false,
        error: 'Task not found'
      });
    }

    if (!author || !content) {
      return res.status(400).json({
        success: false,
        error: 'Author and content are required'
      });
    }

    const comment = {
      id: Date.now(),
      author,
      content,
      timestamp: new Date().toISOString()
    };

    task.comments.push(comment);
    task.updatedAt = new Date().toISOString();
    
    res.status(201).json({
      success: true,
      data: comment,
      message: 'Comment added successfully'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Update task progress
app.patch('/api/tasks/:id/progress', (req, res) => {
  try {
    const { progress } = req.body;
    const task = tasks.find(t => t.id === parseInt(req.params.id));
    
    if (!task) {
      return res.status(404).json({
        success: false,
        error: 'Task not found'
      });
    }

    if (progress < 0 || progress > 100) {
      return res.status(400).json({
        success: false,
        error: 'Progress must be between 0 and 100'
      });
    }

    task.progress = progress;
    task.updatedAt = new Date().toISOString();
    
    // Auto-update status based on progress
    if (progress === 100) {
      task.status = 'Done';
    } else if (progress > 0) {
      task.status = 'In Progress';
    }
    
    res.json({
      success: true,
      data: task,
      message: 'Task progress updated successfully'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Configuration API
app.get('/api/config', (req, res) => {
  try {
    res.json({
      success: true,
      data: {
        project: config.project,
        categories: config.tasks.categories,
        priorities: config.priorities,
        statuses: config.statuses,
        templates: config.tasks.templates,
        workflows: config.workflows
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Dashboard API
app.get('/api/dashboard', (req, res) => {
  try {
    const totalTasks = tasks.length;
    const completedTasks = tasks.filter(t => t.status === 'Done').length;
    const inProgressTasks = tasks.filter(t => t.status === 'In Progress').length;
    const pendingTasks = tasks.filter(t => t.status === 'To Do').length;
    
    const categoryBreakdown = config.tasks.categories.map(category => ({
      name: category.name,
      count: tasks.filter(t => t.category === category.name).length,
      color: category.color
    }));

    const priorityBreakdown = config.priorities.map(priority => ({
      name: priority.name,
      count: tasks.filter(t => t.priority === priority.name).length,
      color: priority.color
    }));

    res.json({
      success: true,
      data: {
        summary: {
          total: totalTasks,
          completed: completedTasks,
          inProgress: inProgressTasks,
          pending: pendingTasks,
          completionRate: totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0
        },
        categoryBreakdown,
        priorityBreakdown,
        recentTasks: tasks
          .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt))
          .slice(0, 5)
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Health check
app.get('/api/health', (req, res) => {
  res.json({
    success: true,
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    version: config.project.version
  });
});

// Serve static files (for future web interface)
app.use(express.static(path.join(__dirname, 'public')));

// Serve configuration file
app.get('/config', (req, res) => {
  res.json(config);
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({
    success: false,
    error: 'Something went wrong!'
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: 'Route not found'
  });
});

// Start server
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`🚀 Task Master AI for ClaudeCluster is running on port ${PORT}`);
    console.log(`📊 Dashboard: http://localhost:${PORT}/api/dashboard`);
    console.log(`🔧 API Health: http://localhost:${PORT}/api/health`);
    console.log(`⚙️  Config: http://localhost:${PORT}/config`);
    console.log(`\n🎯 Ready to orchestrate your ClaudeCluster development tasks!`);
  });
}

module.exports = app;
