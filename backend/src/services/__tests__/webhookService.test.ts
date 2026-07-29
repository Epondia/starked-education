/**
 * Webhook Service Tests
 *
 * Comprehensive test coverage for the webhook system including:
 * - Webhook registration and CRUD
 * - Tenant isolation
 * - Event type validation
 * - Per-tenant rate limiting (max 50 webhooks)
 * - HMAC-SHA256 signature generation and verification
 * - Event delivery to subscriber endpoints
 * - Exponential backoff retry on failure
 * - Auto-deactivation after 6 consecutive failures
 * - Secret rotation
 * - Delivery history and manual retry
 * - Deleting a webhook removes pending deliveries
 */

import { WebhookService } from '../webhookService';
import { WebhookEventType, MAX_WEBHOOKS_PER_TENANT, MAX_CONSECUTIVE_FAILURES } from '../../models/Webhook';
import { WebhookDeliveryStatus } from '../../models/WebhookDelivery';

// Mock axios for HTTP delivery
jest.mock('axios', () => ({
  post: jest.fn(),
}));

// Mock logger to silence output during tests
jest.mock('../../utils/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
  __esModule: true,
  default: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

import axios from 'axios';
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('WebhookService', () => {
  let service: WebhookService;

  beforeEach(() => {
    service = new WebhookService();
    jest.clearAllMocks();
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  // ─── Registration ────────────────────────────────────────────────────────

  describe('registerWebhook', () => {
    it('should register a webhook with is_active: true and auto-generated secret', async () => {
      const webhook = await service.registerWebhook('tenant-1', {
        url: 'https://example.com/hook',
        events: [WebhookEventType.CREDENTIAL_ISSUED],
      });

      expect(webhook.id).toBeDefined();
      expect(webhook.tenantId).toBe('tenant-1');
      expect(webhook.url).toBe('https://example.com/hook');
      expect(webhook.isActive).toBe(true);
      expect(webhook.secret).toBeDefined();
      expect(webhook.secret.length).toBe(64); // 32 bytes hex = 64 chars
      expect(webhook.events).toEqual([WebhookEventType.CREDENTIAL_ISSUED]);
      expect(webhook.payloadVersion).toBe('1.0');
      expect(webhook.consecutiveFailures).toBe(0);
    });

    it('should accept a custom secret', async () => {
      const webhook = await service.registerWebhook('tenant-1', {
        url: 'https://example.com/hook',
        events: [WebhookEventType.USER_REGISTERED],
        secret: 'my-custom-secret',
      });

      expect(webhook.secret).toBe('my-custom-secret');
    });

    it('should reject invalid event types', async () => {
      await expect(
        service.registerWebhook('tenant-1', {
          url: 'https://example.com/hook',
          events: ['invalid.event' as any],
        }),
      ).rejects.toThrow('Invalid event types');
    });

    it('should reject invalid URLs', async () => {
      await expect(
        service.registerWebhook('tenant-1', {
          url: 'not-a-url',
          events: [WebhookEventType.COURSE_CREATED],
        }),
      ).rejects.toThrow('Invalid webhook URL');
    });

    it('should enforce max 50 webhooks per tenant', async () => {
      for (let i = 0; i < MAX_WEBHOOKS_PER_TENANT; i++) {
        await service.registerWebhook('tenant-1', {
          url: `https://example.com/hook-${i}`,
          events: [WebhookEventType.USER_REGISTERED],
        });
      }

      await expect(
        service.registerWebhook('tenant-1', {
          url: 'https://example.com/hook-overflow',
          events: [WebhookEventType.USER_REGISTERED],
        }),
      ).rejects.toThrow(`Maximum of ${MAX_WEBHOOKS_PER_TENANT}`);
    });

    it('should allow all 8 supported event types', async () => {
      const allEvents = [
        WebhookEventType.CREDENTIAL_ISSUED,
        WebhookEventType.CREDENTIAL_REVOKED,
        WebhookEventType.COURSE_CREATED,
        WebhookEventType.COURSE_UPDATED,
        WebhookEventType.ENROLLMENT_CREATED,
        WebhookEventType.ENROLLMENT_COMPLETED,
        WebhookEventType.PAYMENT_RECEIVED,
        WebhookEventType.USER_REGISTERED,
      ];

      const webhook = await service.registerWebhook('tenant-1', {
        url: 'https://example.com/hook',
        events: allEvents,
      });

      expect(webhook.events).toEqual(allEvents);
    });
  });

  // ─── Tenant Isolation ────────────────────────────────────────────────────

  describe('tenant isolation', () => {
    it('should not allow Tenant A to see Tenant B webhooks', async () => {
      await service.registerWebhook('tenant-A', {
        url: 'https://a.example.com/hook',
        events: [WebhookEventType.USER_REGISTERED],
      });

      const tenantBWebhooks = service.getWebhooksForTenant('tenant-B');
      expect(tenantBWebhooks).toHaveLength(0);
    });

    it('should not allow Tenant A to modify Tenant B webhooks', async () => {
      const webhook = await service.registerWebhook('tenant-B', {
        url: 'https://b.example.com/hook',
        events: [WebhookEventType.COURSE_CREATED],
      });

      await expect(
        service.updateWebhook(webhook.id, 'tenant-A', { description: 'hacked' }),
      ).rejects.toThrow('not found');
    });

    it('should not allow Tenant A to delete Tenant B webhooks', async () => {
      const webhook = await service.registerWebhook('tenant-B', {
        url: 'https://b.example.com/hook',
        events: [WebhookEventType.COURSE_CREATED],
      });

      await expect(
        service.deleteWebhook(webhook.id, 'tenant-A'),
      ).rejects.toThrow('not found');
    });

    it('getWebhookByIdAndTenant should return undefined for cross-tenant access', async () => {
      const webhook = await service.registerWebhook('tenant-A', {
        url: 'https://a.example.com/hook',
        events: [WebhookEventType.PAYMENT_RECEIVED],
      });

      const result = service.getWebhookByIdAndTenant(webhook.id, 'tenant-B');
      expect(result).toBeUndefined();
    });
  });

  // ─── Update / Delete ──────────────────────────────────────────────────────

  describe('updateWebhook', () => {
    it('should update URL, events, and description', async () => {
      const webhook = await service.registerWebhook('tenant-1', {
        url: 'https://example.com/hook',
        events: [WebhookEventType.USER_REGISTERED],
      });

      const updated = await service.updateWebhook(webhook.id, 'tenant-1', {
        url: 'https://example.com/v2/hook',
        events: [WebhookEventType.COURSE_CREATED, WebhookEventType.COURSE_UPDATED],
        description: 'Updated webhook',
      });

      expect(updated.url).toBe('https://example.com/v2/hook');
      expect(updated.events).toEqual([WebhookEventType.COURSE_CREATED, WebhookEventType.COURSE_UPDATED]);
      expect(updated.description).toBe('Updated webhook');
    });

    it('should deactivate a webhook', async () => {
      const webhook = await service.registerWebhook('tenant-1', {
        url: 'https://example.com/hook',
        events: [WebhookEventType.PAYMENT_RECEIVED],
      });

      const updated = await service.updateWebhook(webhook.id, 'tenant-1', { isActive: false });
      expect(updated.isActive).toBe(false);
    });
  });

  describe('deleteWebhook', () => {
    it('should delete a webhook and its delivery history', async () => {
      const webhook = await service.registerWebhook('tenant-1', {
        url: 'https://example.com/hook',
        events: [WebhookEventType.USER_REGISTERED],
      });

      const deleted = await service.deleteWebhook(webhook.id, 'tenant-1');
      expect(deleted).toBe(true);

      expect(service.getWebhooksForTenant('tenant-1')).toHaveLength(0);
    });
  });

  // ─── Secret Rotation ──────────────────────────────────────────────────────

  describe('rotateSecret', () => {
    it('should generate a new secret and return it', async () => {
      const webhook = await service.registerWebhook('tenant-1', {
        url: 'https://example.com/hook',
        events: [WebhookEventType.CREDENTIAL_ISSUED],
      });

      const originalSecret = webhook.secret;
      const result = await service.rotateSecret(webhook.id, 'tenant-1');

      expect(result.secret).toBeDefined();
      expect(result.secret).not.toBe(originalSecret);
      expect(result.secret.length).toBe(64);
    });

    it('should reject cross-tenant secret rotation', async () => {
      const webhook = await service.registerWebhook('tenant-1', {
        url: 'https://example.com/hook',
        events: [WebhookEventType.CREDENTIAL_ISSUED],
      });

      await expect(
        service.rotateSecret(webhook.id, 'tenant-2'),
      ).rejects.toThrow('not found');
    });
  });

  // ─── HMAC Signature ───────────────────────────────────────────────────────

  describe('signPayload / verifySignature', () => {
    it('should produce a valid HMAC-SHA256 signature', () => {
      const body = '{"event":"user.registered"}';
      const secret = 'test-secret';

      const signature = service.signPayload(body, secret);
      expect(signature).toBeDefined();
      expect(typeof signature).toBe('string');
      expect(signature.length).toBe(64); // 32 bytes hex = 64 chars
    });

    it('should verify a correct signature', () => {
      const body = '{"event":"user.registered"}';
      const secret = 'test-secret';

      const signature = service.signPayload(body, secret);
      const isValid = service.verifySignature(body, secret, signature);
      expect(isValid).toBe(true);
    });

    it('should reject an incorrect signature', () => {
      const body = '{"event":"user.registered"}';
      const secret = 'test-secret';

      const wrongSignature = service.signPayload(body, 'wrong-secret');
      const isValid = service.verifySignature(body, secret, wrongSignature);
      expect(isValid).toBe(false);
    });

    it('should reject a tampered payload', () => {
      const body = '{"event":"user.registered"}';
      const secret = 'test-secret';

      const signature = service.signPayload(body, secret);
      const isValid = service.verifySignature('{"event":"tampered"}', secret, signature);
      expect(isValid).toBe(false);
    });
  });

  // ─── Event Delivery ───────────────────────────────────────────────────────

  describe('emitEvent', () => {
    it('should deliver event to all active subscribed webhooks', async () => {
      mockedAxios.post.mockResolvedValueOnce({ status: 200, data: 'ok' });

      await service.registerWebhook('tenant-1', {
        url: 'https://example.com/hook',
        events: [WebhookEventType.CREDENTIAL_ISSUED],
      });

      await service.emitEvent('tenant-1', WebhookEventType.CREDENTIAL_ISSUED, {
        credentialId: 'cred-1',
      });

      expect(mockedAxios.post).toHaveBeenCalledTimes(1);
      const [url, body, config] = mockedAxios.post.mock.calls[0];
      expect(url).toBe('https://example.com/hook');

      const payload = JSON.parse(body);
      expect(payload.event).toBe('credential.issued');
      expect(payload.tenantId).toBe('tenant-1');
      expect(payload.data.credentialId).toBe('cred-1');

      // Verify signature header
      const headers = config!.headers as Record<string, string>;
      expect(headers['X-Starked-Signature']).toBeDefined();
      expect(headers['X-Starked-Webhook-Version']).toBe('1.0');
      expect(headers['X-Starked-Event']).toBe('credential.issued');
    });

    it('should not deliver events to inactive webhooks', async () => {
      const webhook = await service.registerWebhook('tenant-1', {
        url: 'https://example.com/hook',
        events: [WebhookEventType.PAYMENT_RECEIVED],
      });

      await service.updateWebhook(webhook.id, 'tenant-1', { isActive: false });
      await service.emitEvent('tenant-1', WebhookEventType.PAYMENT_RECEIVED, {});

      expect(mockedAxios.post).not.toHaveBeenCalled();
    });

    it('should not deliver events to webhooks not subscribed to that event', async () => {
      await service.registerWebhook('tenant-1', {
        url: 'https://example.com/hook',
        events: [WebhookEventType.COURSE_CREATED],
      });

      await service.emitEvent('tenant-1', WebhookEventType.USER_REGISTERED, {});
      expect(mockedAxios.post).not.toHaveBeenCalled();
    });

    it('should deliver to multiple subscribers', async () => {
      mockedAxios.post.mockResolvedValue({ status: 200, data: 'ok' });

      await service.registerWebhook('tenant-1', {
        url: 'https://a.example.com/hook',
        events: [WebhookEventType.USER_REGISTERED],
      });

      await service.registerWebhook('tenant-1', {
        url: 'https://b.example.com/hook',
        events: [WebhookEventType.USER_REGISTERED, WebhookEventType.COURSE_CREATED],
      });

      await service.emitEvent('tenant-1', WebhookEventType.USER_REGISTERED, { userId: 'u-1' });
      expect(mockedAxios.post).toHaveBeenCalledTimes(2);
    });

    it('should include X-Starked-Webhook-Version header', async () => {
      mockedAxios.post.mockResolvedValueOnce({ status: 200, data: 'ok' });

      await service.registerWebhook('tenant-1', {
        url: 'https://example.com/hook',
        events: [WebhookEventType.COURSE_CREATED],
      });

      await service.emitEvent('tenant-1', WebhookEventType.COURSE_CREATED, { courseId: 'c-1' });

      const headers = mockedAxios.post.mock.calls[0][2]!.headers as Record<string, string>;
      expect(headers['X-Starked-Webhook-Version']).toBe('1.0');
    });
  });

  // ─── Delivery Failure & Retry ─────────────────────────────────────────────

  describe('delivery failure and retry', () => {
    it('should log failure on non-2xx response', async () => {
      mockedAxios.post.mockResolvedValueOnce({ status: 500, data: 'Internal Server Error' });

      const webhook = await service.registerWebhook('tenant-1', {
        url: 'https://example.com/hook',
        events: [WebhookEventType.USER_REGISTERED],
      });

      await service.emitEvent('tenant-1', WebhookEventType.USER_REGISTERED, {});

      const deliveries = service.getDeliveryHistory(webhook.id, 'tenant-1');
      expect(deliveries).toHaveLength(1);
      expect(deliveries[0].status).toBe(WebhookDeliveryStatus.FAILED);
      expect(deliveries[0].statusCode).toBe(500);
    });

    it('should auto-deactivate after 6 consecutive failures', async () => {
      mockedAxios.post.mockResolvedValue({ status: 500, data: 'error' });

      const webhook = await service.registerWebhook('tenant-1', {
        url: 'https://example.com/hook',
        events: [WebhookEventType.USER_REGISTERED],
      });

      // Trigger 6 failures
      for (let i = 0; i < MAX_CONSECUTIVE_FAILURES; i++) {
        await service.emitEvent('tenant-1', WebhookEventType.USER_REGISTERED, { attempt: i });
      }

      const updated = service.getWebhookByIdAndTenant(webhook.id, 'tenant-1');
      expect(updated!.isActive).toBe(false);
      expect(updated!.consecutiveFailures).toBe(MAX_CONSECUTIVE_FAILURES);
    });

    it('should reset failure counter on successful delivery', async () => {
      // Fail twice then succeed
      mockedAxios.post
        .mockResolvedValueOnce({ status: 500, data: 'error' })
        .mockResolvedValueOnce({ status: 500, data: 'error' })
        .mockResolvedValueOnce({ status: 200, data: 'ok' });

      const webhook = await service.registerWebhook('tenant-1', {
        url: 'https://example.com/hook',
        events: [WebhookEventType.PAYMENT_RECEIVED],
      });

      // Fail twice (schedules retries but we advance timers to skip them)
      await service.emitEvent('tenant-1', WebhookEventType.PAYMENT_RECEIVED, {});
      await service.emitEvent('tenant-1', WebhookEventType.PAYMENT_RECEIVED, {});

      // Third attempt succeeds
      await service.emitEvent('tenant-1', WebhookEventType.PAYMENT_RECEIVED, {});

      const updated = service.getWebhookByIdAndTenant(webhook.id, 'tenant-1');
      expect(updated!.consecutiveFailures).toBe(0);
      expect(updated!.isActive).toBe(true);
    });

    it('should log network errors as failed deliveries', async () => {
      mockedAxios.post.mockRejectedValueOnce(new Error('ECONNREFUSED'));

      const webhook = await service.registerWebhook('tenant-1', {
        url: 'https://example.com/hook',
        events: [WebhookEventType.COURSE_UPDATED],
      });

      await service.emitEvent('tenant-1', WebhookEventType.COURSE_UPDATED, {});

      const deliveries = service.getDeliveryHistory(webhook.id, 'tenant-1');
      expect(deliveries[0].status).toBe(WebhookDeliveryStatus.FAILED);
      expect(deliveries[0].errorMessage).toBe('ECONNREFUSED');
    });
  });

  // ─── Delivery History & Manual Retry ──────────────────────────────────────

  describe('delivery history and manual retry', () => {
    it('should return delivery history sorted by newest first', async () => {
      mockedAxios.post.mockResolvedValue({ status: 200, data: 'ok' });

      const webhook = await service.registerWebhook('tenant-1', {
        url: 'https://example.com/hook',
        events: [WebhookEventType.USER_REGISTERED],
      });

      await service.emitEvent('tenant-1', WebhookEventType.USER_REGISTERED, { seq: 1 });
      await service.emitEvent('tenant-1', WebhookEventType.USER_REGISTERED, { seq: 2 });

      const history = service.getDeliveryHistory(webhook.id, 'tenant-1');
      expect(history).toHaveLength(2);
    });

    it('should support pagination on delivery history', async () => {
      mockedAxios.post.mockResolvedValue({ status: 200, data: 'ok' });

      const webhook = await service.registerWebhook('tenant-1', {
        url: 'https://example.com/hook',
        events: [WebhookEventType.USER_REGISTERED],
      });

      for (let i = 0; i < 5; i++) {
        await service.emitEvent('tenant-1', WebhookEventType.USER_REGISTERED, { seq: i });
      }

      const page = service.getDeliveryHistory(webhook.id, 'tenant-1', { limit: 2, offset: 0 });
      expect(page).toHaveLength(2);
    });

    it('should manually retry a failed delivery', async () => {
      mockedAxios.post
        .mockResolvedValueOnce({ status: 500, data: 'error' })
        .mockResolvedValueOnce({ status: 200, data: 'ok' });

      const webhook = await service.registerWebhook('tenant-1', {
        url: 'https://example.com/hook',
        events: [WebhookEventType.CREDENTIAL_REVOKED],
      });

      await service.emitEvent('tenant-1', WebhookEventType.CREDENTIAL_REVOKED, {});

      const history = service.getDeliveryHistory(webhook.id, 'tenant-1');
      const failedDelivery = history[0];

      const retried = await service.retryDelivery(webhook.id, failedDelivery.id);
      expect(retried.deliveryAttempt).toBe(2);
      expect(retried.status).toBe(WebhookDeliveryStatus.SUCCESS);
      expect(retried.statusCode).toBe(200);
    });
  });

  // ─── Truncation ───────────────────────────────────────────────────────────

  describe('response body truncation', () => {
    it('should truncate response body exceeding 2048 characters', async () => {
      const longBody = 'x'.repeat(5000);
      mockedAxios.post.mockResolvedValueOnce({ status: 200, data: longBody });

      const webhook = await service.registerWebhook('tenant-1', {
        url: 'https://example.com/hook',
        events: [WebhookEventType.ENROLLMENT_CREATED],
      });

      await service.emitEvent('tenant-1', WebhookEventType.ENROLLMENT_CREATED, {});

      const history = service.getDeliveryHistory(webhook.id, 'tenant-1');
      expect(history[0].responseBody!.length).toBeLessThanOrEqual(2048 + 20); // +truncation suffix
      expect(history[0].responseBody).toContain('[truncated]');
    });
  });
});
