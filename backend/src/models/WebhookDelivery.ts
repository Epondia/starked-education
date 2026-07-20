/**
 * WebhookDelivery Model
 * Defines the structure and interfaces for webhook delivery logs
 */

export enum WebhookDeliveryStatus {
  PENDING = 'pending',
  SUCCESS = 'success',
  FAILED = 'failed',
  RETRYING = 'retrying',
}

/**
 * Webhook delivery log entry
 */
export interface WebhookDelivery {
  id: string;
  webhookId: string;
  eventType: string;
  deliveryAttempt: number;
  statusCode?: number;
  responseBody?: string; // truncated to 2048 chars
  durationMs?: number;
  status: WebhookDeliveryStatus;
  nextRetryAt?: Date;
  errorMessage?: string;
  createdAt: Date;
}

/**
 * Exponential backoff intervals for retry scheduling (in milliseconds)
 * 1min, 5min, 15min, 1hr, 6hr, 24hr
 */
export const RETRY_BACKOFF_INTERVALS: number[] = [
  60_000,         // 1 minute
  300_000,        // 5 minutes
  900_000,        // 15 minutes
  3_600_000,      // 1 hour
  21_600_000,     // 6 hours
  86_400_000,     // 24 hours
];

/**
 * Maximum response body length stored in delivery logs
 */
export const MAX_RESPONSE_BODY_LENGTH = 2048;
