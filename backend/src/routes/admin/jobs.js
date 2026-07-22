/**
 * Admin Jobs Monitoring Routes
 *
 * Exposes the email job queue and worker state to operators for monitoring
 * dashboards (or Prometheus / Grafana / a custom UI). Both endpoints return
 * JSON.
 *
 *   GET /api/v1/admin/jobs/email/stats
 *     -> { status, data: { queue, worker, timestamp } }
 *
 *   GET /api/v1/admin/jobs/email/events?userId=&emailType=&eventType=&limit=
 *     -> { status, data: EmailEvent[], timestamp }
 *
 * SECURITY NOTE:
 *   These endpoints expose userIds, queue payloads, and recipient PII
 *   (email addresses). They are intentionally unauthenticated at the route
 *   level and are designed to be mounted behind gateway / ingress auth, or
 *   for the maintainer to attach `authenticateToken` / `requireAdmin`
 *   middleware (from `../../middleware/auth`) in a follow-up PR. See the
 *   PR description for #178/#192 for full context.
 */

const express = require('express');
const logger = require('../../utils/logger');
const { getQueueManager } = require('../../services/queueManager');
const { getEmailService } = require('../../services/emailService');
const { getEmailWorker } = require('../../workers/emailWorker');

const router = express.Router();

const MAX_EVENT_LIMIT = 1000;
const MAX_QUEUE_ITEMS_INSPECTED = 50;

/**
 * GET /api/v1/admin/jobs/email/stats
 * Queue depth, processing flag, recent items, and worker stats.
 */
router.get('/email/stats', async (req, res) => {
  try {
    const queue = getQueueManager();
    const worker = getEmailWorker();

    const queueStats = {
      pending:
        typeof queue.getPendingCount === 'function' ? queue.getPendingCount() : 0,
      isProcessing:
        typeof queue.isProcessing === 'function' ? queue.isProcessing() : false,
      items:
        typeof queue.getPendingItems === 'function'
          ? queue.getPendingItems().slice(0, MAX_QUEUE_ITEMS_INSPECTED)
          : [],
    };

    res.status(200).json({
      status: 'success',
      data: {
        queue: queueStats,
        worker: worker.getStats(),
        timestamp: new Date().toISOString(),
      },
    });
  } catch (err) {
    logger.error('Failed to fetch email job stats:', err);
    res
      .status(500)
      .json({ status: 'error', message: 'Failed to fetch email job stats' });
  }
});

/**
 * GET /api/v1/admin/jobs/email/events
 * Recent email delivery events. Optional query params:
 *   userId, emailType, eventType, limit (1..1000, default 100)
 */
router.get('/email/events', async (req, res) => {
  try {
    const emailService = getEmailService();

    const rawLimit = parseInt(req.query.limit, 10);
    const limit = Number.isFinite(rawLimit)
      ? Math.min(Math.max(rawLimit, 1), MAX_EVENT_LIMIT)
      : 100;

    const events = emailService.getEvents({
      userId: req.query.userId,
      emailType: req.query.emailType,
      eventType: req.query.eventType,
      limit,
    });

    res.status(200).json({
      status: 'success',
      data: events,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    logger.error('Failed to fetch email events:', err);
    res
      .status(500)
      .json({ status: 'error', message: 'Failed to fetch email events' });
  }
});

module.exports = router;
module.exports.default = router;
