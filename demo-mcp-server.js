const http = require('http');

const server = http.createServer((req, res) => {
  const url = req.url;
  const method = req.method;
  
  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Content-Type', 'application/json');
  
  if (method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }
  
  console.log('📨 MCP Server Request:', method, url);
  
  if (url === '/health') {
    res.writeHead(200);
    res.end(JSON.stringify({
      status: 'healthy',
      service: 'ClaudeCluster MCP Server Demo',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      version: '0.1.0',
      workers: {
        total: 2,
        available: 2,
        offline: 0
      },
      systemInfo: {
        nodeVersion: process.version,
        platform: process.platform,
        memoryUsage: process.memoryUsage()
      }
    }));
  } else if (url === '/workers') {
    res.writeHead(200);
    res.end(JSON.stringify({
      workers: [
        {
          id: 'worker-1',
          url: 'http://worker-1-demo:3001',
          status: 'available',
          activeTasks: 0,
          totalTasksExecuted: Math.floor(Math.random() * 100)
        },
        {
          id: 'worker-2',
          url: 'http://worker-2-demo:3001', 
          status: 'available',
          activeTasks: 0,
          totalTasksExecuted: Math.floor(Math.random() * 100)
        }
      ],
      totalWorkers: 2,
      availableWorkers: 2
    }));
  } else if (url === '/tasks' && method === 'POST') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        const data = JSON.parse(body);
        const taskId = 'task-' + Date.now() + '-' + Math.random().toString(36).substr(2, 5);
        const assignedWorker = Math.random() > 0.5 ? 'worker-1' : 'worker-2';
        
        console.log('🚀 New task submitted:', { taskId, prompt: data.prompt?.substring(0, 50) + '...' });
        
        // Simulate forwarding to worker
        setTimeout(() => {
          console.log(`✅ Task ${taskId} completed by ${assignedWorker}`);
        }, 2000 + Math.random() * 3000);
        
        res.writeHead(200);
        res.end(JSON.stringify({
          success: true,
          taskId: taskId,
          status: 'accepted',
          assignedWorker: assignedWorker,
          message: 'Task submitted successfully and assigned to worker',
          estimatedCompletion: new Date(Date.now() + 30000).toISOString()
        }));
      } catch (error) {
        res.writeHead(400);
        res.end(JSON.stringify({
          success: false,
          error: 'Invalid JSON payload'
        }));
      }
    });
  } else if (url.startsWith('/tasks/') && url.endsWith('/status')) {
    const taskId = url.split('/')[2];
    res.writeHead(200);
    res.end(JSON.stringify({
      taskId: taskId,
      status: Math.random() > 0.3 ? 'completed' : 'in_progress',
      progress: Math.floor(Math.random() * 100),
      assignedWorker: 'worker-' + (Math.random() > 0.5 ? '1' : '2'),
      output: `Sample task execution output for ${taskId}`,
      result: {
        files_created: ['app.js', 'package.json'],
        tests_passed: 5,
        lines_of_code: 42
      },
      createdAt: new Date(Date.now() - 60000).toISOString(),
      updatedAt: new Date().toISOString()
    }));
  } else {
    res.writeHead(404);
    res.end(JSON.stringify({
      error: 'Not found',
      availableEndpoints: ['/health', '/workers', '/tasks (POST)', '/tasks/{id}/status']
    }));
  }
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
  console.log('🚀 ClaudeCluster MCP Server Demo running on port ' + PORT);
  console.log('📊 Available endpoints:');
  console.log('  - GET  /health');
  console.log('  - GET  /workers');
  console.log('  - POST /tasks');
  console.log('  - GET  /tasks/{id}/status');
  console.log('');
  console.log('💡 Test the system:');
  console.log(`  curl http://localhost:${PORT}/health`);
  console.log(`  curl -X POST http://localhost:${PORT}/tasks -H "Content-Type: application/json" -d '{"prompt":"Create hello world"}'`);
});