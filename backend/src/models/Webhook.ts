/**
 * Webhook Model
 * Defines the structure and interfaces for webhook registration data
 */

/**
 * Supported webhook event types that third parties can subscribe to
 */
export enum WebhookEventType {
  CREDENTIAL_ISSUED = 'credential.issued',
  CREDENTIAL_REVOKED = 'credential.revoked',
  COURSE_CREATED = 'course.created',
  COURSE_UPDATED = 'course.updated',
  ENROLLMENT_CREATED = 'enrollment.created',
  ENROLLMENT_COMPLETED = 'enrollment.completed',
  PAYMENT_RECEIVED = 'payment.received',
  USER_REGISTERED = 'user.registered',
}

export const ALL_WEBHOOK_EVENT_TYPES: string[] = Object.values(WebhookEventType);

/**
 * Webhook registration record
 */
export interface Webhook {
  id: string;
  tenantId: string;
  url: string;
  events: WebhookEventType[];
  secret: string; // HMAC signing secret
  description?: string;
  isActive: boolean;
  payloadVersion: string; // e.g. "1.0"
  consecutiveFailures: number;
  lastFailureAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Request body for creating a webhook
 */
export interface CreateWebhookRequest {
  url: string;
  events: WebhookEventType[];
  secret?: string; // optional; auto-generated if not provided
  description?: string;
}

/**
 * Request body for updating a webhook
 */
export interface UpdateWebhookRequest {
  url?: string;
  events?: WebhookEventType[];
  description?: string;
  isActive?: boolean;
}

/**
 * Webhook payload sent to subscriber endpoints
 */
export interface WebhookPayload {
  id: string; // delivery id
  event: WebhookEventType;
  tenantId: string;
  timestamp: string; // ISO 8601
  data: Record<string, any>;
}

/**
 * Maximum webhooks allowed per tenant
 */
export const MAX_WEBHOOKS_PER_TENANT = 50;

/**
 * Maximum consecutive failures before auto-deactivation
 */
export const MAX_CONSECUTIVE_FAILURES = 6;

/**
 * Webhook payload schema version
 */
export const WEBHOOK_PAYLOAD_VERSION = '1.0';
