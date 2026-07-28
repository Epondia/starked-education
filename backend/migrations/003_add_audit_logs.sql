-- Migration: 003_add_audit_logs
-- Description: Add tamper-evident audit logging table for security-sensitive operations.
-- Related: Issue #205 - Implement audit logging for sensitive operations
--
-- Covers:
--   1. Credential issuance and revocation events
--   2. User role changes and permission grants
--   3. Failed authentication attempts
--   4. General admin actions

CREATE TABLE IF NOT EXISTS audit_logs (
    id            BIGSERIAL       PRIMARY KEY,
    event_type    VARCHAR(64)     NOT NULL,
    severity      VARCHAR(16)     NOT NULL DEFAULT 'INFO',
    actor_id      VARCHAR(255)    NOT NULL,
    actor_role    VARCHAR(64)     NOT NULL DEFAULT 'unknown',
    target_id     VARCHAR(255),
    target_type   VARCHAR(64),
    details       JSONB           NOT NULL DEFAULT '{}',
    ip_address    VARCHAR(64),
    user_agent    TEXT,
    status        VARCHAR(16)     NOT NULL DEFAULT 'success',
    prev_hash     VARCHAR(128)    NOT NULL,
    entry_hash    VARCHAR(128)    NOT NULL,
    created_at    TIMESTAMPTZ     NOT NULL DEFAULT NOW()
);

-- Indexes for fast queries in the admin audit log viewer
CREATE INDEX IF NOT EXISTS idx_audit_actor    ON audit_logs (actor_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_target   ON audit_logs (target_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_event    ON audit_logs (event_type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_severity ON audit_logs (severity, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_status   ON audit_logs (status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_time     ON audit_logs (created_at DESC);

-- GIN index on details JSONB for full-text search
CREATE INDEX IF NOT EXISTS idx_audit_details_gin ON audit_logs USING GIN (details jsonb_path_ops);

-- Ensure at least one entry exists as the genesis block for hash chaining
-- This is done through the application layer (auditLogService.getLatestHash returns 'GENESIS')
-- The first real entry will chain from this genesis value.
