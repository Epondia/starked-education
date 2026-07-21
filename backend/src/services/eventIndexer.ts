/**
 * Event Indexer Service
 *
 * Polls the Stellar/Soroban RPC for new contract events, decodes them, and
 * persists them into the `indexed_events` PostgreSQL table.
 *
 * Design principles
 * ─────────────────
 * • Events are processed in ascending ledger order so that domain-table
 *   side-effects (e.g. upserting a credential row) always see earlier state.
 * • The last successfully committed ledger is stored in `indexer_checkpoints`
 *   so the service resumes exactly where it left off after a restart.
 * • Deduplication is enforced at the DB level (UNIQUE constraint) and at the
 *   application level (ON CONFLICT DO NOTHING) so re-processing the same
 *   ledger range is always safe.
 * • A single failed event is logged and skipped; it never blocks the batch.
 * • Graceful shutdown: the current batch finishes, the checkpoint is saved,
 *   then the process exits.
 */

import { rpc, xdr, scValToNative } from '@stellar/stellar-sdk';
import { Pool, PoolClient } from 'pg';
import logger from '../utils/logger';
import {
  IndexedEventType,
  IndexerStatus,
  CreateIndexedEventDto,
  TOPIC_TO_EVENT_TYPE,
  IndexedEventPayload,
} from '../models/IndexedEvent';

// ---------------------------------------------------------------------------
// Configuration (resolved once at construction time)
// ---------------------------------------------------------------------------
export interface EventIndexerConfig {
  /** Soroban RPC endpoint, e.g. https://soroban-testnet.stellar.org */
  rpcUrl: string;
  /** Comma-separated list of contract IDs to watch */
  contractIds: string[];
  /** Poll interval in milliseconds (default 5 000) */
  pollIntervalMs: number;
  /** How many ledgers to fetch per poll batch (default 100) */
  batchSize: number;
  /** Optional override of the starting ledger (useful for back-fill) */
  startLedger?: number;
}

function resolveConfig(): EventIndexerConfig {
  const raw = process.env.EVENT_INDEXER_CONTRACT_IDS ?? '';
  const contractIds = raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  return {
    rpcUrl: process.env.SOROBAN_RPC_URL ?? 'https://soroban-testnet.stellar.org',
    contractIds,
    pollIntervalMs: parseInt(process.env.EVENT_INDEXER_POLL_INTERVAL ?? '5000', 10),
    batchSize: parseInt(process.env.EVENT_INDEXER_BATCH_SIZE ?? '100', 10),
    startLedger: process.env.EVENT_INDEXER_START_LEDGER
      ? parseInt(process.env.EVENT_INDEXER_START_LEDGER, 10)
      : undefined,
  };
}

// ---------------------------------------------------------------------------
// Singleton status (shared with the health route)
// ---------------------------------------------------------------------------
let _status: IndexerStatus = {
  status: 'stopped',
  lastLedger: 0,
  eventsProcessed: 0,
  lag: 0,
};

/** Read-only snapshot of the current indexer status */
export function getIndexerStatus(): Readonly<IndexerStatus> {
  return { ..._status };
}

// ---------------------------------------------------------------------------
// EventIndexer class
// ---------------------------------------------------------------------------
export class EventIndexer {
  private readonly config: EventIndexerConfig;
  private readonly pool: Pool;
  private readonly rpc: rpc.Server;

  private timer: NodeJS.Timeout | null = null;
  private running = false;
  private stopping = false;
  private startedAt: string | null = null;

  constructor(pool: Pool, config?: Partial<EventIndexerConfig>) {
    this.config = { ...resolveConfig(), ...config };
    this.pool = pool;
    this.rpc = new rpc.Server(this.config.rpcUrl, { allowHttp: true });
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Lifecycle
  // ──────────────────────────────────────────────────────────────────────────

  async start(): Promise<void> {
    if (this.running) {
      logger.warn('[EventIndexer] Already running');
      return;
    }

    if (this.config.contractIds.length === 0) {
      logger.warn('[EventIndexer] No contract IDs configured – indexer will not start. Set EVENT_INDEXER_CONTRACT_IDS.');
      _status = { ..._status, status: 'stopped', errorMessage: 'No contract IDs configured' };
      return;
    }

    this.running = true;
    this.stopping = false;
    this.startedAt = new Date().toISOString();
    _status = { ..._status, status: 'running', startedAt: this.startedAt, errorMessage: undefined };

    logger.info(`[EventIndexer] Starting – contracts: ${this.config.contractIds.join(', ')}`);
    logger.info(`[EventIndexer] Poll interval: ${this.config.pollIntervalMs}ms | Batch size: ${this.config.batchSize}`);

    // Kick off the first poll immediately, then schedule subsequent ones
    await this.poll();
    this.scheduleNext();
  }

  async stop(): Promise<void> {
    if (!this.running) return;

    logger.info('[EventIndexer] Graceful shutdown initiated – finishing current batch…');
    this.stopping = true;

    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }

    // Wait up to 30 s for the in-progress poll to finish
    const deadline = Date.now() + 30_000;
    while (this.running && Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 200));
    }

    this.running = false;
    _status = { ..._status, status: 'stopped' };
    logger.info('[EventIndexer] Stopped cleanly.');
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Scheduling
  // ──────────────────────────────────────────────────────────────────────────

  private scheduleNext(): void {
    if (this.stopping) {
      this.running = false;
      return;
    }
    this.timer = setTimeout(async () => {
      await this.poll();
      this.scheduleNext();
    }, this.config.pollIntervalMs);
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Main poll loop
  // ──────────────────────────────────────────────────────────────────────────

  async poll(): Promise<void> {
    try {
      // 1. Get the current network ledger
      const latestLedger = await this.fetchLatestLedger();

      // 2. Load our checkpoint
      const fromLedger = await this.loadCheckpoint();

      // 3. Compute the window to fetch
      const startLedger = fromLedger + 1;
      const endLedger = Math.min(startLedger + this.config.batchSize - 1, latestLedger);

      const lag = latestLedger - fromLedger;
      _status = { ..._status, lastLedger: fromLedger, lag };

      if (startLedger > latestLedger) {
        // Already caught up
        logger.debug(`[EventIndexer] Caught up at ledger ${fromLedger} (network: ${latestLedger})`);
        return;
      }

      logger.info(`[EventIndexer] Fetching events ledger ${startLedger}–${endLedger} (lag: ${lag})`);

      // 4. Fetch events from RPC for each registered contract
      for (const contractId of this.config.contractIds) {
        await this.indexContract(contractId, startLedger, endLedger);
      }

      // 5. Advance checkpoint to the end of the processed window
      await this.saveCheckpoint(endLedger);
      _status = { ..._status, lastLedger: endLedger, lag: latestLedger - endLedger };
    } catch (err: any) {
      logger.error('[EventIndexer] Poll error:', err?.message ?? err);
      _status = { ..._status, status: 'error', errorMessage: err?.message ?? String(err) };
      // Do not re-throw – allow the scheduler to keep running
    }
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Per-contract indexing
  // ──────────────────────────────────────────────────────────────────────────

  private async indexContract(
    contractId: string,
    startLedger: number,
    endLedger: number,
  ): Promise<void> {
    let cursor: string | undefined;
    let pagesFetched = 0;

    do {
      let response: rpc.Api.GetEventsResponse;

      try {
        response = await this.rpc.getEvents({
          startLedger,
          filters: [
            {
              type: 'contract',
              contractIds: [contractId],
            },
          ],
          cursor,
          limit: 200,
        });
      } catch (rpcErr: any) {
        logger.error(`[EventIndexer] RPC getEvents error for contract ${contractId}: ${rpcErr?.message}`);
        return;
      }

      const events = response.events ?? [];
      pagesFetched++;

      // Filter to the requested ledger window (the RPC may return beyond endLedger)
      const inWindow = events.filter((e) => {
        const ledger = parseInt(e.ledger, 10);
        return ledger >= startLedger && ledger <= endLedger;
      });

      await this.persistBatch(contractId, inWindow);

      // Pagination: the RPC returns a cursor for the next page
      cursor = (response as any).cursor ?? undefined;

      // Stop paginating if there are no more events or we've gone past the window
      const allBeyondWindow = events.length > 0 &&
        events.every((e) => parseInt(e.ledger, 10) > endLedger);

      if (!cursor || events.length === 0 || allBeyondWindow) break;
    } while (true);

    logger.debug(`[EventIndexer] Contract ${contractId}: fetched ${pagesFetched} page(s) for ledger ${startLedger}–${endLedger}`);
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Batch persistence
  // ──────────────────────────────────────────────────────────────────────────

  private async persistBatch(
    contractId: string,
    events: rpc.Api.EventResponse[],
  ): Promise<void> {
    if (events.length === 0) return;

    const client: PoolClient = await this.pool.connect();
    try {
      await client.query('BEGIN');

      for (const raw of events) {
        try {
          await this.persistSingleEvent(client, contractId, raw);
        } catch (eventErr: any) {
          // A single bad event must not abort the whole batch
          logger.error(
            `[EventIndexer] Skipping malformed event ` +
            `(contract=${contractId}, ledger=${raw.ledger}, id=${raw.id}): ` +
            `${eventErr?.message ?? eventErr}`,
          );
          _status = { ..._status, status: 'running' }; // reset to running after error log
        }
      }

      await client.query('COMMIT');
      logger.debug(`[EventIndexer] Committed ${events.length} event(s) for contract ${contractId}`);
    } catch (batchErr: any) {
      await client.query('ROLLBACK');
      logger.error(`[EventIndexer] Batch transaction rolled back: ${batchErr?.message}`);
      throw batchErr;
    } finally {
      client.release();
    }
  }

  private async persistSingleEvent(
    client: PoolClient,
    contractId: string,
    raw: rpc.Api.EventResponse,
  ): Promise<void> {
    const ledger = parseInt(raw.ledger, 10);

    // event_index: Soroban event IDs are <ledger>-<txIndex>-<eventIndex>
    const parts = raw.id.split('-');
    const eventIndex = parseInt(parts[parts.length - 1] ?? '0', 10);

    // Decode topics
    const topics = this.decodeTopics(raw.topic);

    // Resolve event type from the first two topics
    const topicKey = topics.slice(0, 2).join(':');
    const eventType: string = TOPIC_TO_EVENT_TYPE[topicKey] ?? IndexedEventType.Unknown;

    // Decode the payload value (last XDR field in value)
    const payload = this.decodePayload(raw.value, eventType);

    const dto: CreateIndexedEventDto = {
      contract_id: contractId,
      ledger,
      event_index: eventIndex,
      event_type: eventType,
      topic: topics,
      payload,
    };

    // Insert – ON CONFLICT DO NOTHING guarantees idempotency
    await client.query(
      `INSERT INTO indexed_events (contract_id, ledger, event_index, event_type, topic, payload)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (contract_id, ledger, event_index) DO NOTHING`,
      [
        dto.contract_id,
        dto.ledger,
        dto.event_index,
        dto.event_type,
        dto.topic,
        JSON.stringify(dto.payload),
      ],
    );

    // Side-effects: update domain tables based on event type
    await this.applyDomainSideEffects(client, dto);

    _status = { ..._status, eventsProcessed: _status.eventsProcessed + 1 };
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Domain side-effects
  // ──────────────────────────────────────────────────────────────────────────

  /**
   * After inserting the raw event row, optionally mirror relevant data into
   * domain tables so the backend API can serve it without re-querying the chain.
   *
   * All side-effects run inside the same transaction as the event insert so
   * the DB stays consistent even if the process is killed mid-batch.
   */
  private async applyDomainSideEffects(
    client: PoolClient,
    dto: CreateIndexedEventDto,
  ): Promise<void> {
    try {
      switch (dto.event_type) {
        case IndexedEventType.CredentialIssued:
          await this.handleCredentialIssued(client, dto);
          break;

        case IndexedEventType.CredentialRevoked:
          await this.handleCredentialRevoked(client, dto);
          break;

        case IndexedEventType.CourseCreated:
          await this.handleCourseCreated(client, dto);
          break;

        case IndexedEventType.EnrollmentCreated:
          await this.handleEnrollmentCreated(client, dto);
          break;

        // AchievementMinted, PaymentReceived, ProfileUpdated are logged only
        default:
          break;
      }
    } catch (sideEffectErr: any) {
      // Side-effect failures are warnings – the indexed_events row was already inserted
      logger.warn(
        `[EventIndexer] Domain side-effect failed for ${dto.event_type} ` +
        `(ledger=${dto.ledger}): ${sideEffectErr?.message}`,
      );
    }
  }

  private async handleCredentialIssued(client: PoolClient, dto: CreateIndexedEventDto): Promise<void> {
    const p = dto.payload as { recipient?: string; credential_id?: string | number; course_id?: string; issuer?: string };
    if (!p.recipient || !p.credential_id) return;

    await client.query(
      `INSERT INTO credentials (
          on_chain_id, recipient_address, issuer_address, course_id,
          status, issued_at, ledger
       ) VALUES ($1, $2, $3, $4, 'active', NOW(), $5)
       ON CONFLICT (on_chain_id) DO UPDATE
           SET status = 'active',
               issued_at = EXCLUDED.issued_at,
               ledger    = EXCLUDED.ledger`,
      [String(p.credential_id), p.recipient, p.issuer ?? null, p.course_id ?? null, dto.ledger],
    ).catch((err: any) => {
      // Table may not exist yet – warn and move on
      if (err.code !== '42P01') throw err;
      logger.debug('[EventIndexer] credentials table not found – skipping side-effect');
    });
  }

  private async handleCredentialRevoked(client: PoolClient, dto: CreateIndexedEventDto): Promise<void> {
    const p = dto.payload as { credential_id?: string | number };
    if (!p.credential_id) return;

    await client.query(
      `UPDATE credentials SET status = 'revoked', revoked_at = NOW()
       WHERE on_chain_id = $1`,
      [String(p.credential_id)],
    ).catch((err: any) => {
      if (err.code !== '42P01') throw err;
    });
  }

  private async handleCourseCreated(client: PoolClient, dto: CreateIndexedEventDto): Promise<void> {
    const p = dto.payload as { course_id?: string; creator?: string; title?: string };
    if (!p.course_id) return;

    await client.query(
      `INSERT INTO courses (on_chain_id, creator_address, title, created_ledger)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (on_chain_id) DO NOTHING`,
      [p.course_id, p.creator ?? null, p.title ?? null, dto.ledger],
    ).catch((err: any) => {
      if (err.code !== '42P01') throw err;
      logger.debug('[EventIndexer] courses table not found – skipping side-effect');
    });
  }

  private async handleEnrollmentCreated(client: PoolClient, dto: CreateIndexedEventDto): Promise<void> {
    const p = dto.payload as { student?: string; course_id?: string };
    if (!p.student || !p.course_id) return;

    await client.query(
      `INSERT INTO enrollments (student_address, course_id, enrolled_ledger, status)
       VALUES ($1, $2, $3, 'active')
       ON CONFLICT (student_address, course_id) DO NOTHING`,
      [p.student, p.course_id, dto.ledger],
    ).catch((err: any) => {
      if (err.code !== '42P01') throw err;
      logger.debug('[EventIndexer] enrollments table not found – skipping side-effect');
    });
  }

  // ──────────────────────────────────────────────────────────────────────────
  // XDR decoding helpers
  // ──────────────────────────────────────────────────────────────────────────

  /**
   * Decode a Soroban event topic list.
   * Each topic is base64-encoded XDR – we decode it and stringify the symbol.
   */
  private decodeTopics(rawTopics: xdr.ScVal[]): string[] {
    return rawTopics.map((t) => {
      try {
        const native = scValToNative(t);
        // Symbols come back as strings; other types as their native JS equivalents
        return String(native);
      } catch {
        return '[unknown]';
      }
    });
  }

  /**
   * Decode the event value (body) into a plain JS object payload.
   * Soroban events carry the value as a single ScVal which is usually a Map or
   * a Vec of values matching the tuple published in Rust.
   */
  private decodePayload(
    rawValue: xdr.ScVal | null | undefined,
    eventType: string,
  ): IndexedEventPayload {
    if (!rawValue) return {};

    let native: unknown;
    try {
      native = scValToNative(rawValue);
    } catch (err: any) {
      logger.warn(`[EventIndexer] Could not decode payload for ${eventType}: ${err?.message}`);
      return {};
    }

    if (native === null || native === undefined) return {};

    // If the decoded value is already an object, return it directly
    if (typeof native === 'object' && !Array.isArray(native)) {
      return native as IndexedEventPayload;
    }

    // Arrays: map positional values into named fields by event type
    if (Array.isArray(native)) {
      return this.arrayToPayload(native, eventType);
    }

    // Primitive – wrap it
    return { value: native } as IndexedEventPayload;
  }

  /**
   * Convert a positional value array (from a Rust tuple published via
   * env.events().publish()) into a typed payload object.
   *
   * The tuple order is inferred from the Rust source:
   *   cred issued  → (user, credential_id, event_id)
   *   ach earn     → (user, event_id)
   *   course done  → (user, event_id)
   */
  private arrayToPayload(values: unknown[], eventType: string): IndexedEventPayload {
    switch (eventType) {
      case IndexedEventType.CredentialIssued:
        return {
          recipient:     values[0] != null ? String(values[0]) : undefined,
          credential_id: values[1],
          event_id:      values[2],
        };

      case IndexedEventType.CredentialRevoked:
        return {
          credential_id: values[0],
          revoker:       values[1] != null ? String(values[1]) : undefined,
        };

      case IndexedEventType.AchievementMinted:
        return {
          recipient:        values[0] != null ? String(values[0]) : undefined,
          achievement_id:   values[1],
        };

      case IndexedEventType.EnrollmentCreated:
        return {
          student:   values[0] != null ? String(values[0]) : undefined,
          course_id: values[1] != null ? String(values[1]) : undefined,
        };

      case IndexedEventType.PaymentReceived:
        return {
          payer:     values[0] != null ? String(values[0]) : undefined,
          recipient: values[1] != null ? String(values[1]) : undefined,
          amount:    values[2],
        };

      default:
        // Generic fallback – preserve positional values with numeric keys
        return values.reduce<Record<string, unknown>>((acc, v, i) => {
          acc[`value_${i}`] = v;
          return acc;
        }, {});
    }
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Checkpoint management
  // ──────────────────────────────────────────────────────────────────────────

  private async loadCheckpoint(): Promise<number> {
    try {
      const result = await this.pool.query<{ last_ledger: string }>(
        `SELECT last_ledger FROM indexer_checkpoints WHERE checkpoint_key = 'default' LIMIT 1`,
      );
      if (result.rows.length === 0) return this.config.startLedger ?? 0;
      const fromDb = parseInt(result.rows[0].last_ledger, 10);
      return fromDb > 0 ? fromDb : (this.config.startLedger ?? 0);
    } catch (err: any) {
      if (err.code === '42P01') {
        // Table doesn't exist yet – return 0 to start from the beginning
        return this.config.startLedger ?? 0;
      }
      throw err;
    }
  }

  private async saveCheckpoint(ledger: number): Promise<void> {
    try {
      await this.pool.query(
        `INSERT INTO indexer_checkpoints (checkpoint_key, last_ledger, updated_at)
         VALUES ('default', $1, NOW())
         ON CONFLICT (checkpoint_key) DO UPDATE
             SET last_ledger = EXCLUDED.last_ledger,
                 updated_at  = EXCLUDED.updated_at`,
        [ledger],
      );
    } catch (err: any) {
      if (err.code === '42P01') {
        logger.debug('[EventIndexer] indexer_checkpoints table not found – skipping checkpoint save');
        return;
      }
      throw err;
    }
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Network helpers
  // ──────────────────────────────────────────────────────────────────────────

  private async fetchLatestLedger(): Promise<number> {
    const info = await this.rpc.getLatestLedger();
    return info.sequence;
  }
}

// ---------------------------------------------------------------------------
// Module-level singleton – shared by index.js boot code and health route
// ---------------------------------------------------------------------------
let _indexerInstance: EventIndexer | null = null;

export function getEventIndexer(pool?: Pool): EventIndexer {
  if (!_indexerInstance) {
    if (!pool) {
      throw new Error('[EventIndexer] Must supply a Pool the first time getEventIndexer() is called');
    }
    _indexerInstance = new EventIndexer(pool);
  }
  return _indexerInstance;
}

export default EventIndexer;
