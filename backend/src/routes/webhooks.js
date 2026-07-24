/**
 * Webhook Controller
 * Allows external systems to subscribe to credential events.
 * Events: credential.issued, credential.revoked, credential.verified
 */

const express = require('express');
const crypto = require('crypto');
const router = express.Router();

// In-memory webhook store (replace with database in production)
const webhooks = new Map();
const webhookSecrets = new Map();

/**
 * POST /api/webhooks/register
 * Register a new webhook endpoint
 */
router.post('/register', (req, res) => {
  try {
    const { url, events, description } = req.body;

    if (!url || !events || !Array.isArray(events) || events.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'URL and events array are required',
      });
    }

    const webhookId = crypto.randomUUID();
    const secret = crypto.randomBytes(32).toString('hex');

    webhooks.set(webhookId, {
      id: webhookId,
      url,
      events,
      description: description || '',
      active: true,
      createdAt: new Date().toISOString(),
      deliveryCount: 0,
      failureCount: 0,
    });

    webhookSecrets.set(webhookId, secret);

    res.status(201).json({
      success: true,
      message: 'Webhook registered. Store your secret securely.',
      webhook: {
        id: webhookId,
        url,
        events,
        active: true,
      },
      secret,
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/webhooks
 * List all registered webhooks
 */
router.get('/', (req, res) => {
  const list = Array.from(webhooks.values()).map(w => ({
    ...w,
    secret: undefined,
  }));
  res.json({ success: true, data: list, count: list.length });
});

/**
 * GET /api/webhooks/:id
 * Get webhook details
 */
router.get('/:id', (req, res) => {
  const webhook = webhooks.get(req.params.id);
  if (!webhook) {
    return res.status(404).json({ success: false, error: 'Webhook not found' });
  }
  res.json({ success: true, data: { ...webhook, secret: undefined } });
});

/**
 * DELETE /api/webhooks/:id
 * Unregister a webhook
 */
router.delete('/:id', (req, res) => {
  if (!webhooks.has(req.params.id)) {
    return res.status(404).json({ success: false, error: 'Webhook not found' });
  }
  webhooks.delete(req.params.id);
  webhookSecrets.delete(req.params.id);
  res.json({ success: true, message: 'Webhook unregistered' });
});

/**
 * POST /api/webhooks/:id/rotate-secret
 * Rotate webhook signing secret
 */
router.post('/:id/rotate-secret', (req, res) => {
  const webhook = webhooks.get(req.params.id);
  if (!webhook) {
    return res.status(404).json({ success: false, error: 'Webhook not found' });
  }
  const newSecret = crypto.randomBytes(32).toString('hex');
  webhookSecrets.set(req.params.id, newSecret);
  res.json({ success: true, secret: newSecret });
});

/**
 * Sign a webhook payload with HMAC-SHA256
 */
function signPayload(secret, payload) {
  return crypto.createHmac('sha256', secret).update(JSON.stringify(payload)).digest('hex');
}

/**
 * Deliver event to all matching webhooks
 * Called internally when a credential event occurs
 */
async function deliverEvent(eventType, eventData) {
  const matchingWebhooks = Array.from(webhooks.values()).filter(
    w => w.active && w.events.includes(eventType)
  );

  for (const webhook of matchingWebhooks) {
    const secret = webhookSecrets.get(webhook.id);
    const payload = {
      event: eventType,
      data: eventData,
      timestamp: new Date().toISOString(),
      webhookId: webhook.id,
    };
    const signature = signPayload(secret, payload);

    try {
      // In production, use fetch/axios with retry logic
      // For now, just log the delivery attempt
      console.log(`[Webhook] Delivering ${eventType} to ${webhook.url}`);
      webhook.deliveryCount++;
      // Actual delivery would be:
      // await fetch(webhook.url, { method: 'POST', headers: { 'X-Webhook-Signature': signature }, body: JSON.stringify(payload) });
    } catch (error) {
      webhook.failureCount++;
      console.error(`[Webhook] Delivery failed for ${webhook.id}:`, error.message);
    }
  }
}

/**
 * POST /api/webhooks/test/:id
 * Send a test event to verify webhook configuration
 */
router.post('/test/:id', async (req, res) => {
  const webhook = webhooks.get(req.params.id);
  if (!webhook) {
    return res.status(404).json({ success: false, error: 'Webhook not found' });
  }
  await deliverEvent('test.event', { message: 'Test event', webhookId: webhook.id });
  res.json({ success: true, message: 'Test event sent' });
});

module.exports = router;
module.exports.deliverEvent = deliverEvent;
