const request = require('supertest');
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
