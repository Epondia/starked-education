-- UP
-- Migration: Create indexed_events table for Stellar/Soroban contract event indexing
-- Each event is uniquely keyed by (contract_id, ledger, event_index) to prevent duplicates.

CREATE TABLE IF NOT EXISTS indexed_events (
    id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    contract_id       VARCHAR(64) NOT NULL,
    ledger            BIGINT      NOT NULL,
    event_index       INTEGER     NOT NULL,
    event_type        VARCHAR(64) NOT NULL,
    topic             TEXT[]      NOT NULL DEFAULT '{}',
    payload           JSONB       NOT NULL DEFAULT '{}',
    processed_at      TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    created_at        TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),

    -- Deduplication: same event on same contract at same ledger position must not appear twice
    CONSTRAINT uq_indexed_events_key UNIQUE (contract_id, ledger, event_index)
);

-- Index for efficient range queries by ledger (used by the indexer resume logic)
CREATE INDEX IF NOT EXISTS idx_indexed_events_ledger
    ON indexed_events (ledger ASC);

-- Index for querying by contract
CREATE INDEX IF NOT EXISTS idx_indexed_events_contract_id
    ON indexed_events (contract_id);

-- Index for querying by event type
CREATE INDEX IF NOT EXISTS idx_indexed_events_event_type
    ON indexed_events (event_type);

-- Index to support last-processed-ledger checkpoint lookups
CREATE INDEX IF NOT EXISTS idx_indexed_events_processed_at
    ON indexed_events (processed_at);

-- Table to persist the indexer checkpoint (last successfully indexed ledger per contract set)
CREATE TABLE IF NOT EXISTS indexer_checkpoints (
    id              SERIAL      PRIMARY KEY,
    checkpoint_key  VARCHAR(64) NOT NULL UNIQUE,  -- e.g. 'default' or contract group name
    last_ledger     BIGINT      NOT NULL DEFAULT 0,
    updated_at      TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Seed a default checkpoint row so the indexer can always UPDATE rather than INSERT/UPDATE
INSERT INTO indexer_checkpoints (checkpoint_key, last_ledger)
VALUES ('default', 0)
ON CONFLICT (checkpoint_key) DO NOTHING;

-- @undo
DROP TABLE IF EXISTS indexer_checkpoints;
DROP INDEX  IF EXISTS idx_indexed_events_processed_at;
DROP INDEX  IF EXISTS idx_indexed_events_event_type;
DROP INDEX  IF EXISTS idx_indexed_events_contract_id;
DROP INDEX  IF EXISTS idx_indexed_events_ledger;
DROP TABLE  IF EXISTS indexed_events;
