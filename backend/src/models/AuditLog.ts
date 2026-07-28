/**
 * AuditLog Model
 * Tamper-evident audit log entries for security-sensitive operations.
 * Uses hash chaining (SHA-256) to ensure log integrity:
 *   entry_hash = SHA-256(prev_hash || event_type || actor_id || target_id || details || timestamp)
 *
 * Covers the four categories required by Issue #205:
 *   1. Credential issuance and revocation
 *   2. User role changes and permission grants
 *   3. Failed authentication attempts
 *   4. General admin actions
 */

export enum AuditEventType {
  // Credential events
  CREDENTIAL_ISSUED = 'CREDENTIAL_ISSUED',
  CREDENTIAL_REVOKED = 'CREDENTIAL_REVOKED',

  // Role & permission events
  ROLE_CHANGED = 'ROLE_CHANGED',
  PERMISSION_GRANTED = 'PERMISSION_GRANTED',
  PERMISSION_REVOKED = 'PERMISSION_REVOKED',

  // Authentication events
  LOGIN_SUCCESS = 'LOGIN_SUCCESS',
  LOGIN_FAILED = 'LOGIN_FAILED',
  LOGOUT = 'LOGOUT',
  TOKEN_REFRESH = 'TOKEN_REFRESH',
  PASSWORD_CHANGED = 'PASSWORD_CHANGED',
  MFA_ENROLLED = 'MFA_ENROLLED',
  MFA_REMOVED = 'MFA_REMOVED',

  // Admin actions
  ADMIN_SETTINGS_UPDATED = 'ADMIN_SETTINGS_UPDATED',
  ADMIN_BACKUP_INITIATED = 'ADMIN_BACKUP_INITIATED',
  ADMIN_ANNOUNCEMENT_CREATED = 'ADMIN_ANNOUNCEMENT_CREATED',
  ADMIN_USER_ACTION = 'ADMIN_USER_ACTION',
  ADMIN_SYSTEM_ACTION = 'ADMIN_SYSTEM_ACTION',
}

export enum AuditSeverity {
  INFO = 'INFO',
  WARNING = 'WARNING',
  CRITICAL = 'CRITICAL',
}

export interface IAuditLogEntry {
  id: number;
  eventType: AuditEventType;
  severity: AuditSeverity;
  actorId: string;
  actorRole: string;
  targetId?: string;
  targetType?: string;
  details: Record<string, any>;
  ipAddress?: string;
  userAgent?: string;
  status: 'success' | 'failure';
  prevHash: string;
  entryHash: string;
  createdAt: Date;
}

export interface AuditLogFilter {
  eventType?: AuditEventType | AuditEventType[];
  severity?: AuditSeverity;
  actorId?: string;
  targetId?: string;
  targetType?: string;
  status?: 'success' | 'failure';
  startDate?: Date;
  endDate?: Date;
  limit?: number;
  offset?: number;
  sortBy?: 'createdAt' | 'severity' | 'eventType';
  sortOrder?: 'asc' | 'desc';
  search?: string;
}

/**
 * Build the CREATE TABLE SQL for audit_logs.
 * Called from the migration system to ensure the table exists.
 */
export function getAuditLogTableDDL(): string {
  return `
    CREATE TABLE IF NOT EXISTS audit_logs (
      id            BIGSERIAL PRIMARY KEY,
      event_type    VARCHAR(64)   NOT NULL,
      severity      VARCHAR(16)   NOT NULL DEFAULT 'INFO',
      actor_id      VARCHAR(255)  NOT NULL,
      actor_role    VARCHAR(64)   NOT NULL DEFAULT 'unknown',
      target_id     VARCHAR(255),
      target_type   VARCHAR(64),
      details       JSONB         NOT NULL DEFAULT '{}',
      ip_address    VARCHAR(64),
      user_agent    TEXT,
      status        VARCHAR(16)   NOT NULL DEFAULT 'success',
      prev_hash     VARCHAR(128)  NOT NULL,
      entry_hash    VARCHAR(128)  NOT NULL,
      created_at    TIMESTAMPTZ   NOT NULL DEFAULT NOW()
    );

    -- Support fast lookups by actor, target, event type, and time range
    CREATE INDEX IF NOT EXISTS idx_audit_actor    ON audit_logs (actor_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_audit_target   ON audit_logs (target_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_audit_event    ON audit_logs (event_type, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_audit_severity ON audit_logs (severity, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_audit_status   ON audit_logs (status, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_audit_time     ON audit_logs (created_at DESC);

    -- Full-text search on details JSONB for admin search
    CREATE INDEX IF NOT EXISTS idx_audit_details_gin ON audit_logs USING GIN (details jsonb_path_ops);
  `;
}
