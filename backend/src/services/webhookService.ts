/**
 * Webhook Service
 * Handles webhook registration, delivery, retry logic, and management
 */

import crypto from 'crypto';
import axios, { AxiosResponse } from 'axios';
import { v4 as uuidv4 } from 'uuid';
import {
  Webhook,
  WebhookEventType,
  WebhookPayload,
  CreateWebhookRequest,
  UpdateWebhookRequest,
  ALL_WEBHOOK_EVENT_TYPES,
  MAX_WEBHOOKS_PER_TENANT,
  MAX_CONSECUTIVE_FAILURES,
  WEBHOOK_PAYLOAD_VERSION,
} from '../models/Webhook';
import {
  WebhookDelivery,
  WebhookDeliveryStatus,
  RETRY_BACKOFF_INTERVALS,
  MAX_RESPONSE_BODY_LENGTH,
} from '../models/WebhookDelivery';
import logger from '../utils/logger';

/**
 * WebhookService manages the full lifecycle of webhooks:
 * - Registration and tenant-scoped CRUD
 * - Event dispatch with HMAC-SHA256 signed payloads
 * - Exponential-backoff retry on non-2xx responses
 * - Auto-deactivation after 6 consecutive failures
 * - Delivery log persistence
 */
export class WebhookService {
  // In-memory stores (replace with DB calls in production)
  private webhooks: Map<string, Webhook> = new Map();
  private deliveries: Map<string, WebhookDelivery[]> = new Map(); // keyed by webhookId
  private retryQueue: Map<string, NodeJS.Timeout> = new Map(); // deliveryId -> timeout handle

  // ─── Registration ────────────────────────────────────────────────────────────

  /**
   * Register a new webhook for a tenant.
   * Enforces the per-tenant limit of MAX_WEBHOOKS_PER_TENANT.
   */
  async registerWebhook(
    tenantId: string,
    request: CreateWebhookRequest,
  ): Promise<Webhook> {
    // Validate event types
    const invalidEvents = request.events.filter(
      (e) => !ALL_WEBHOOK_EVENT_TYPES.includes(e),
    );
    if (invalidEvents.length > 0) {
      throw new Error(`Invalid event types: ${invalidEvents.join(', ')}`);
    }

    // Validate URL
    try {
      new URL(request.url);
    } catch {
      throw new Error(`Invalid webhook URL: ${request.url}`);
    }

    // Enforce per-tenant limit
    const tenantWebhooks = this.getWebhooksForTenant(tenantId);
    if (tenantWebhooks.length >= MAX_WEBHOOKS_PER_TENANT) {
      throw new Error(
        `Maximum of ${MAX_WEBHOOKS_PER_TENANT} webhooks per tenant reached`,
      );
    }

    const secret = request.secret || this.generateSecret();
    const webhook: Webhook = {
      id: uuidv4(),
      tenantId,
      url: request.url,
      events: request.events,
      secret,
      description: request.description,
      isActive: true,
      payloadVersion: WEBHOOK_PAYLOAD_VERSION,
      consecutiveFailures: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    this.webhooks.set(webhook.id, webhook);
    this.deliveries.set(webhook.id, []);

    logger.info(`Webhook registered: ${webhook.id} for tenant ${tenantId}`);
    return webhook;
  }

  /**
   * Update an existing webhook (URL, events, active state, description).
   */
  async updateWebhook(
    webhookId: string,
    tenantId: string,
    updates: UpdateWebhookRequest,
  ): Promise<Webhook> {
    const webhook = this.getWebhookByIdAndTenant(webhookId, tenantId);
    if (!webhook) {
      throw new Error(`Webhook ${webhookId} not found for tenant ${tenantId}`);
    }

    if (updates.events) {
      const invalidEvents = updates.events.filter(
        (e) => !ALL_WEBHOOK_EVENT_TYPES.includes(e),
      );
      if (invalidEvents.length > 0) {
        throw new Error(`Invalid event types: ${invalidEvents.join(', ')}`);
      }
      webhook.events = updates.events;
    }

    if (updates.url !== undefined) {
      try {
        new URL(updates.url);
      } catch {
        throw new Error(`Invalid webhook URL: ${updates.url}`);
      }
      webhook.url = updates.url;
    }

    if (updates.description !== undefined) {
      webhook.description = updates.description;
    }

    if (updates.isActive !== undefined) {
      webhook.isActive = updates.isActive;
    }

    webhook.updatedAt = new Date();
    this.webhooks.set(webhookId, webhook);

    logger.info(`Webhook updated: ${webhookId}`);
    return webhook;
  }

  /**
   * Delete a webhook and all its pending deliveries.
   */
  async deleteWebhook(webhookId: string, tenantId: string): Promise<boolean> {
    const webhook = this.getWebhookByIdAndTenant(webhookId, tenantId);
    if (!webhook) {
      throw new Error(`Webhook ${webhookId} not found for tenant ${tenantId}`);
    }

    // Cancel any pending retries for this webhook
    const deliveries = this.deliveries.get(webhookId) || [];
    for (const delivery of deliveries) {
      if (delivery.status === WebhookDeliveryStatus.PENDING || delivery.status === WebhookDeliveryStatus.RETRYING) {
        const handle = this.retryQueue.get(delivery.id);
        if (handle) {
          clearTimeout(handle);
          this.retryQueue.delete(delivery.id);
        }
      }
    }

    this.deliveries.delete(webhookId);
    this.webhooks.delete(webhookId);

    logger.info(`Webhook deleted: ${webhookId}`);
    return true;
  }

  /**
   * Rotate the signing secret for a webhook.
   * Returns the new secret.
   */
  async rotateSecret(webhookId: string, tenantId: string): Promise<{ secret: string }> {
    const webhook = this.getWebhookByIdAndTenant(webhookId, tenantId);
    if (!webhook) {
      throw new Error(`Webhook ${webhookId} not found for tenant ${tenantId}`);
    }

    webhook.secret = this.generateSecret();
    webhook.updatedAt = new Date();
    this.webhooks.set(webhookId, webhook);

    logger.info(`Webhook secret rotated: ${webhookId}`);
    return { secret: webhook.secret };
  }

  // ─── Query helpers ──────────────────────────────────────────────────────────

  /**
   * List all webhooks for a given tenant.
   */
  getWebhooksForTenant(tenantId: string): Webhook[] {
    return Array.from(this.webhooks.values()).filter(
      (w) => w.tenantId === tenantId,
    );
  }

  /**
   * Get a single webhook ensuring tenant isolation.
   */
  getWebhookByIdAndTenant(webhookId: string, tenantId: string): Webhook | undefined {
    const webhook = this.webhooks.get(webhookId);
    if (!webhook || webhook.tenantId !== tenantId) return undefined;
    return webhook;
  }

  /**
   * Get delivery history for a webhook.
   */
  getDeliveryHistory(
    webhookId: string,
    tenantId: string,
    options?: { limit?: number; offset?: number },
  ): WebhookDelivery[] {
    const webhook = this.getWebhookByIdAndTenant(webhookId, tenantId);
    if (!webhook) {
      throw new Error(`Webhook ${webhookId} not found for tenant ${tenantId}`);
    }

    const deliveries = this.deliveries.get(webhookId) || [];
    const sorted = [...deliveries].sort(
      (a, b) => b.createdAt.getTime() - a.createdAt.getTime(),
    );

    const limit = options?.limit ?? 50;
    const offset = options?.offset ?? 0;
    return sorted.slice(offset, offset + limit);
  }

  // ─── Event dispatch ─────────────────────────────────────────────────────────

  /**
   * Emit an event to all active webhooks subscribed to that event type.
   * Called by other services when domain events occur.
   */
  async emitEvent(
    tenantId: string,
    eventType: WebhookEventType,
    data: Record<string, any>,
  ): Promise<void> {
    const subscribers = Array.from(this.webhooks.values()).filter(
      (w) => w.tenantId === tenantId && w.isActive && w.events.includes(eventType),
    );

    if (subscribers.length === 0) {
      logger.debug(`No active webhooks for event ${eventType} tenant ${tenantId}`);
      return;
    }

    logger.info(
      `Dispatching event ${eventType} to ${subscribers.length} webhook(s) for tenant ${tenantId}`,
    );

    const deliveryPromises = subscribers.map((webhook) =>
      this.deliverToWebhook(webhook, eventType, data),
    );

    await Promise.allSettled(deliveryPromises);
  }

  /**
   * Deliver a single event to a specific webhook endpoint.
   */
  private async deliverToWebhook(
    webhook: Webhook,
    eventType: WebhookEventType,
    data: Record<string, any>,
  ): Promise<WebhookDelivery> {
    const deliveryId = uuidv4();
    const payload: WebhookPayload = {
      id: deliveryId,
      event: eventType,
      tenantId: webhook.tenantId,
      timestamp: new Date().toISOString(),
      data,
    };

    const body = JSON.stringify(payload);
    const signature = this.signPayload(body, webhook.secret);

    const delivery: WebhookDelivery = {
      id: deliveryId,
      webhookId: webhook.id,
      eventType,
      deliveryAttempt: 1,
      status: WebhookDeliveryStatus.PENDING,
      createdAt: new Date(),
    };

    this.addDelivery(webhook.id, delivery);

    try {
      const start = Date.now();
      const response: AxiosResponse = await axios.post(webhook.url, body, {
        headers: {
          'Content-Type': 'application/json',
          'X-Starked-Signature': signature,
          'X-Starked-Webhook-Version': WEBHOOK_PAYLOAD_VERSION,
          'X-Starked-Event': eventType,
          'X-Starked-Delivery-Id': deliveryId,
        },
        timeout: 30_000, // 30s timeout
        validateStatus: () => true, // don't throw on non-2xx
      });

      delivery.durationMs = Date.now() - start;
      delivery.statusCode = response.status;
      delivery.responseBody = this.truncateResponse(
        typeof response.data === 'string'
          ? response.data
          : JSON.stringify(response.data),
      );

      if (response.status >= 200 && response.status < 300) {
        delivery.status = WebhookDeliveryStatus.SUCCESS;
        this.onDeliverySuccess(webhook);
      } else {
        delivery.status = WebhookDeliveryStatus.FAILED;
        delivery.errorMessage = `Non-2xx response: ${response.status}`;
        await this.onDeliveryFailure(webhook, delivery);
      }
    } catch (error: any) {
      delivery.status = WebhookDeliveryStatus.FAILED;
      delivery.errorMessage = error.message || 'Unknown delivery error';
      delivery.durationMs = 0;
      await this.onDeliveryFailure(webhook, delivery);
    }

    this.updateDelivery(webhook.id, delivery);
    return delivery;
  }

  // ─── Retry logic ────────────────────────────────────────────────────────────

  /**
   * Schedule a retry for a failed delivery using exponential backoff.
   */
  private scheduleRetry(webhook: Webhook, delivery: WebhookDelivery): void {
    const attemptIndex = delivery.deliveryAttempt - 1; // 0-indexed
    if (attemptIndex >= RETRY_BACKOFF_INTERVALS.length) {
      logger.warn(
        `Max retry attempts reached for delivery ${delivery.id}, no more retries`,
      );
      return;
    }

    const delayMs = RETRY_BACKOFF_INTERVALS[attemptIndex];
    delivery.nextRetryAt = new Date(Date.now() + delayMs);
    delivery.status = WebhookDeliveryStatus.RETRYING;
    this.updateDelivery(webhook.id, delivery);

    const handle = setTimeout(async () => {
      this.retryQueue.delete(delivery.id);
      await this.retryDelivery(webhook.id, delivery.id);
    }, delayMs);

    // Prevent the timer from keeping the process alive
    if (handle.unref) handle.unref();

    this.retryQueue.set(delivery.id, handle);

    logger.info(
      `Retry scheduled for delivery ${delivery.id} in ${delayMs / 1000}s (attempt ${delivery.deliveryAttempt + 1})`,
    );
  }

  /**
   * Manually retry a specific delivery (admin action).
   */
  async retryDelivery(webhookId: string, deliveryId: string): Promise<WebhookDelivery> {
    const webhook = this.webhooks.get(webhookId);
    if (!webhook) {
      throw new Error(`Webhook ${webhookId} not found`);
    }

    const deliveries = this.deliveries.get(webhookId) || [];
    const delivery = deliveries.find((d) => d.id === deliveryId);
    if (!delivery) {
      throw new Error(`Delivery ${deliveryId} not found for webhook ${webhookId}`);
    }

    delivery.deliveryAttempt += 1;
    delivery.status = WebhookDeliveryStatus.PENDING;
    delivery.errorMessage = undefined;

    const payload: WebhookPayload = {
      id: delivery.id,
      event: delivery.eventType as WebhookEventType,
      tenantId: webhook.tenantId,
      timestamp: delivery.createdAt.toISOString(),
      data: { retry: true }, // minimal retry payload
    };

    const body = JSON.stringify(payload);
    const signature = this.signPayload(body, webhook.secret);

    try {
      const start = Date.now();
      const response = await axios.post(webhook.url, body, {
        headers: {
          'Content-Type': 'application/json',
          'X-Starked-Signature': signature,
          'X-Starked-Webhook-Version': WEBHOOK_PAYLOAD_VERSION,
          'X-Starked-Event': delivery.eventType,
          'X-Starked-Delivery-Id': delivery.id,
        },
        timeout: 30_000,
        validateStatus: () => true,
      });

      delivery.durationMs = Date.now() - start;
      delivery.statusCode = response.status;
      delivery.responseBody = this.truncateResponse(
        typeof response.data === 'string'
          ? response.data
          : JSON.stringify(response.data),
      );

      if (response.status >= 200 && response.status < 300) {
        delivery.status = WebhookDeliveryStatus.SUCCESS;
        this.onDeliverySuccess(webhook);
      } else {
        delivery.status = WebhookDeliveryStatus.FAILED;
        delivery.errorMessage = `Non-2xx response: ${response.status}`;
        await this.onDeliveryFailure(webhook, delivery);
      }
    } catch (error: any) {
      delivery.status = WebhookDeliveryStatus.FAILED;
      delivery.errorMessage = error.message || 'Unknown delivery error';
      delivery.durationMs = 0;
      await this.onDeliveryFailure(webhook, delivery);
    }

    this.updateDelivery(webhook.id, delivery);
    return delivery;
  }

  // ─── Internal helpers ────────────────────────────────────────────────────────

  /**
   * Called when a delivery succeeds — resets consecutive failure counter.
   */
  private onDeliverySuccess(webhook: Webhook): void {
    webhook.consecutiveFailures = 0;
    webhook.updatedAt = new Date();
    this.webhooks.set(webhook.id, webhook);
  }

  /**
   * Called when a delivery fails — increments failure counter,
   * schedules retry or auto-deactivates after MAX_CONSECUTIVE_FAILURES.
   */
  private async onDeliveryFailure(
    webhook: Webhook,
    delivery: WebhookDelivery,
  ): Promise<void> {
    webhook.consecutiveFailures += 1;
    webhook.lastFailureAt = new Date();
    webhook.updatedAt = new Date();
    this.webhooks.set(webhook.id, webhook);

    if (webhook.consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
      webhook.isActive = false;
      this.webhooks.set(webhook.id, webhook);
      logger.warn(
        `Webhook ${webhook.id} auto-deactivated after ${MAX_CONSECUTIVE_FAILURES} consecutive failures`,
      );
      // Emit admin notification about deactivation
      await this.notifyAdminWebhookDeactivated(webhook);
    } else {
      // Schedule retry with exponential backoff
      this.scheduleRetry(webhook, delivery);
    }
  }

  /**
   * Notify admins that a webhook was auto-deactivated.
   * In production this would create a system notification via NotificationService.
   */
  private async notifyAdminWebhookDeactivated(webhook: Webhook): Promise<void> {
    logger.error(
      `[ADMIN ALERT] Webhook ${webhook.id} (tenant: ${webhook.tenantId}) has been auto-deactivated ` +
        `after ${MAX_CONSECUTIVE_FAILURES} consecutive failures. URL: ${webhook.url}`,
    );
    // Integration hook: NotificationService can be injected here
  }

  /**
   * Generate a cryptographically secure HMAC signing secret.
   */
  private generateSecret(): string {
    return crypto.randomBytes(32).toString('hex');
  }

  /**
   * Sign a payload body using HMAC-SHA256 with the webhook's secret.
   */
  signPayload(body: string, secret: string): string {
    return crypto.createHmac('sha256', secret).update(body).digest('hex');
  }

  /**
   * Verify an incoming signature against the expected payload + secret.
   * Useful for receiver-side verification documentation.
   */
  verifySignature(body: string, secret: string, signature: string): boolean {
    const expected = this.signPayload(body, secret);
    // Timing-safe comparison
    if (expected.length !== signature.length) return false;
    return crypto.timingSafeEqual(
      Buffer.from(expected, 'hex'),
      Buffer.from(signature, 'hex'),
    );
  }

  /**
   * Truncate response body to MAX_RESPONSE_BODY_LENGTH characters.
   */
  private truncateResponse(body: string): string {
    if (!body) return '';
    return body.length > MAX_RESPONSE_BODY_LENGTH
      ? body.slice(0, MAX_RESPONSE_BODY_LENGTH) + '...[truncated]'
      : body;
  }

  private addDelivery(webhookId: string, delivery: WebhookDelivery): void {
    if (!this.deliveries.has(webhookId)) {
      this.deliveries.set(webhookId, []);
    }
    this.deliveries.get(webhookId)!.push(delivery);
  }

  private updateDelivery(webhookId: string, updated: WebhookDelivery): void {
    const list = this.deliveries.get(webhookId) || [];
    const idx = list.findIndex((d) => d.id === updated.id);
    if (idx !== -1) {
      list[idx] = updated;
    }
  }
}

// Singleton instance
export const webhookService = new WebhookService();
