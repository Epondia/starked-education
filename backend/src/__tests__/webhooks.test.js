const request = require('supertest');
const express = require('express');
const webhookRoutes = require('../routes/webhooks');

const app = express();
app.use(express.json());
app.use('/api/webhooks', webhookRoutes);

describe('Webhook Support', () => {
  it('registers a new webhook', async () => {
    const res = await request(app)
      .post('/api/webhooks/register')
      .send({ url: 'https://example.com/webhook', events: ['credential.issued'] });
    expect(res.statusCode).toBe(201);
    expect(res.body).toHaveProperty('success', true);
    expect(res.body).toHaveProperty('secret');
    expect(res.body.webhook).toHaveProperty('id');
  });

  it('rejects registration without URL', async () => {
    const res = await request(app)
      .post('/api/webhooks/register')
      .send({ events: ['credential.issued'] });
    expect(res.statusCode).toBe(400);
  });

  it('lists all webhooks', async () => {
    const res = await request(app).get('/api/webhooks');
    expect(res.statusCode).toBe(200);
    expect(res.body).toHaveProperty('data');
    expect(Array.isArray(res.body.data)).toBe(true);
  });

  it('gets webhook by ID', async () => {
    const reg = await request(app)
      .post('/api/webhooks/register')
      .send({ url: 'https://example.com/wh2', events: ['credential.revoked'] });
    const id = reg.body.webhook.id;
    const res = await request(app).get('/api/webhooks/' + id);
    expect(res.statusCode).toBe(200);
    expect(res.body.data).toHaveProperty('id', id);
  });

  it('rotates webhook secret', async () => {
    const reg = await request(app)
      .post('/api/webhooks/register')
      .send({ url: 'https://example.com/wh3', events: ['credential.verified'] });
    const id = reg.body.webhook.id;
    const res = await request(app).post('/api/webhooks/' + id + '/rotate-secret');
    expect(res.statusCode).toBe(200);
    expect(res.body).toHaveProperty('secret');
  });

  it('deletes a webhook', async () => {
    const reg = await request(app)
      .post('/api/webhooks/register')
      .send({ url: 'https://example.com/wh4', events: ['credential.issued'] });
    const id = reg.body.webhook.id;
    const res = await request(app).delete('/api/webhooks/' + id);
    expect(res.statusCode).toBe(200);
  });

  it('sends test event', async () => {
    const reg = await request(app)
      .post('/api/webhooks/register')
      .send({ url: 'https://example.com/wh5', events: ['test.event'] });
    const id = reg.body.webhook.id;
    const res = await request(app).post('/api/webhooks/test/' + id);
    expect(res.statusCode).toBe(200);
  });
});
