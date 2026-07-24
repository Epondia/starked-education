/**
 * Admin Jobs Routes Tests
 *
 * Exercises /api/v1/admin/jobs/email/stats and /api/v1/admin/jobs/email/events
 * end-to-end via supertest. Mocked queueManager / emailService / emailWorker
 * so the route can be tested in isolation.
 */

const express = require('express');
const request = require('supertest');

jest.mock('../services/queueManager', () => ({
  getQueueManager: jest.fn(),
}));

jest.mock('../services/emailService', () => ({
  getEmailService: jest.fn(),
}));

jest.mock('../workers/emailWorker', () => ({
  getEmailWorker: jest.fn(),
}));

const { getQueueManager } = require('../services/queueManager');
const { getEmailService } = require('../services/emailService');
const { getEmailWorker } = require('../workers/emailWorker');

function buildApp() {
  const app = express();
  // Mirror the production mount path so the route param/scope matches.
  const router = require('../routes/admin/jobs');
  const resolved = router.default || router;
  app.use('/api/v1/admin/jobs', resolved);
  return app;
}

describe('Admin Jobs Routes', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('GET /api/v1/admin/jobs/email/stats', () => {
    it('returns queue depth, worker stats, and timestamp', async () => {
      getQueueManager.mockReturnValue({
        getPendingCount: jest.fn().mockReturnValue(4),
        isProcessing: jest.fn().mockReturnValue(false),
        getPendingItems: jest.fn().mockReturnValue([{ id: 'q1' }, { id: 'q2' }]),
      });
      getEmailWorker.mockReturnValue({
        getStats: jest.fn().mockReturnValue({
          running: true,
          intervalMs: 30000,
          processed: 12,
          failed: 1,
          lastRunAt: '2026-07-22T00:00:00.000Z',
          lastError: null,
        }),
      });

      const res = await request(buildApp()).get('/api/v1/admin/jobs/email/stats');
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('success');
      expect(res.body.data.queue.pending).toBe(4);
      expect(res.body.data.queue.isProcessing).toBe(false);
      expect(res.body.data.queue.items).toHaveLength(2);
      expect(res.body.data.worker.running).toBe(true);
      expect(res.body.data.worker.processed).toBe(12);
      expect(res.body.data.timestamp).toBeTruthy();
    });

    it('caps the inspected queue items to MAX_QUEUE_ITEMS_INSPECTED (50)', async () => {
      const manyItems = Array.from({ length: 75 }, (_, i) => ({ id: `q${i}` }));
      getQueueManager.mockReturnValue({
        getPendingCount: jest.fn().mockReturnValue(75),
        isProcessing: jest.fn().mockReturnValue(false),
        getPendingItems: jest.fn().mockReturnValue(manyItems),
      });
      getEmailWorker.mockReturnValue({ getStats: jest.fn().mockReturnValue({}) });

      const res = await request(buildApp()).get('/api/v1/admin/jobs/email/stats');
      expect(res.status).toBe(200);
      expect(res.body.data.queue.items).toHaveLength(50);
    });

    it('returns 500 when an internal error occurs', async () => {
      getQueueManager.mockImplementation(() => {
        throw new Error('queue manager offline');
      });
      getEmailWorker.mockReturnValue({ getStats: jest.fn() });

      const res = await request(buildApp()).get('/api/v1/admin/jobs/email/stats');
      expect(res.status).toBe(500);
      expect(res.body.status).toBe('error');
    });
  });

  describe('GET /api/v1/admin/jobs/email/events', () => {
    const fakeEvents = [
      { id: 'evt_1', emailId: 'email_1', eventType: 'sent', recipient: 'a@example.com' },
      { id: 'evt_2', emailId: 'email_2', eventType: 'failed', recipient: 'b@example.com' },
    ];

    it('returns events with default limit applied', async () => {
      getEmailService.mockReturnValue({
        getEvents: jest.fn().mockReturnValue(fakeEvents),
      });

      const res = await request(buildApp()).get('/api/v1/admin/jobs/email/events');
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('success');
      expect(res.body.data).toEqual(fakeEvents);
      expect(getEmailService().getEvents).toHaveBeenCalledWith({
        userId: undefined,
        emailType: undefined,
        eventType: undefined,
        limit: 100,
      });
    });

    it('forwards query filter parameters to the email service', async () => {
      getEmailService.mockReturnValue({
        getEvents: jest.fn().mockReturnValue([fakeEvents[1]]),
      });

      const res = await request(buildApp()).get(
        '/api/v1/admin/jobs/email/events?userId=usr1&eventType=failed&limit=10',
      );
      expect(res.status).toBe(200);
      expect(getEmailService().getEvents).toHaveBeenCalledWith({
        userId: 'usr1',
        emailType: undefined,
        eventType: 'failed',
        limit: 10,
      });
    });

    it('bounds the limit between 1 and 1000', async () => {
      getEmailService.mockReturnValue({
        getEvents: jest.fn().mockReturnValue([]),
      });

      // limit=2000 should be clamped to 1000
      await request(buildApp()).get('/api/v1/admin/jobs/email/events?limit=2000');
      expect(getEmailService().getEvents).toHaveBeenLastCalledWith(
        expect.objectContaining({ limit: 1000 }),
      );

      // limit=0 should be clamped up to 1
      await request(buildApp()).get('/api/v1/admin/jobs/email/events?limit=0');
      expect(getEmailService().getEvents).toHaveBeenLastCalledWith(
        expect.objectContaining({ limit: 1 }),
      );
    });

    it('returns 500 when an internal error occurs', async () => {
      getEmailService.mockReturnValue({
        getEvents: jest.fn().mockImplementation(() => {
          throw new Error('boom');
        }),
      });

      const res = await request(buildApp()).get('/api/v1/admin/jobs/email/events');
      expect(res.status).toBe(500);
      expect(res.body.status).toBe('error');
    });
  });
});
