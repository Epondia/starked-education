const request = require('supertest');
const express = require('express');
const exportRoutes = require('../routes/export');

const app = express();
app.use(express.json());
app.use('/api/export', exportRoutes);

describe('Data Export Endpoints', () => {
  it('exports users as JSON', async () => {
    const res = await request(app).get('/api/export/users?format=json');
    expect(res.statusCode).toBe(200);
    expect(res.body).toHaveProperty('success', true);
  });

  it('exports users as CSV', async () => {
    const res = await request(app).get('/api/export/users?format=csv');
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('text/csv');
  });

  it('exports credentials as JSON', async () => {
    const res = await request(app).get('/api/export/credentials?format=json');
    expect(res.statusCode).toBe(200);
  });

  it('exports courses as CSV', async () => {
    const res = await request(app).get('/api/export/courses?format=csv');
    expect(res.statusCode).toBe(200);
  });

  it('supports date range filtering', async () => {
    const res = await request(app).get('/api/export/users?from=2024-01-01&to=2024-12-31');
    expect(res.statusCode).toBe(200);
  });

  it('returns export job status', async () => {
    const res = await request(app).get('/api/export/status/job-123');
    expect(res.statusCode).toBe(200);
    expect(res.body).toHaveProperty('jobId', 'job-123');
  });
});
