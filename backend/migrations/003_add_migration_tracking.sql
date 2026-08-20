-- UP
-- Migration tracking table for rollback support and audit trail
-- Stores metadata about each migration that has been applied
CREATE TABLE IF NOT EXISTS migration_tracking (
    id SERIAL PRIMARY KEY,
    filename VARCHAR(255) NOT NULL UNIQUE,
    batch INTEGER NOT NULL DEFAULT 1,
    applied_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    rolled_back_at TIMESTAMP WITH TIME ZONE,
    status VARCHAR(20) NOT NULL DEFAULT 'applied'
        CHECK (status IN ('applied', 'rolled_back', 'failed')),
    execution_time_ms INTEGER,
    checksum VARCHAR(64),
    error_message TEXT,
    applied_by VARCHAR(255)
);

-- Index for fast status queries
CREATE INDEX IF NOT EXISTS idx_migration_tracking_status
    ON migration_tracking (status);

-- Index for batch rollback queries
CREATE INDEX IF NOT EXISTS idx_migration_tracking_batch
    ON migration_tracking (batch);

-- @undo
DROP TABLE IF EXISTS migration_tracking;
