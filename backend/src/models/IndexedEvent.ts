/**
 * IndexedEvent Model
 *
 * Represents a Stellar/Soroban contract event that has been indexed into
 * PostgreSQL by the eventIndexer service.
 *
 * The table key (contract_id, ledger, event_index) is unique so that
 * re-processing the same ledger range never creates duplicate rows.
 */

// ---------------------------------------------------------------------------
// Supported canonical event types emitted by registered StarkEd contracts.
// These map to the topic tuples published via env.events().publish() in Rust.
// ---------------------------------------------------------------------------
export enum IndexedEventType {
  CredentialIssued   = 'CredentialIssued',
  CredentialRevoked  = 'CredentialRevoked',
  CourseCreated      = 'CourseCreated',
  EnrollmentCreated  = 'EnrollmentCreated',
  AchievementMinted  = 'AchievementMinted',
  PaymentReceived    = 'PaymentReceived',
  ProfileUpdated     = 'ProfileUpdated',
  /** Any event whose topic combination does not match a known type */
  Unknown            = 'Unknown',
}

// ---------------------------------------------------------------------------
// Raw topic→event-type mapping.
// Keys are the stringified first two topic symbols, e.g. "cred:issued".
// Soroban symbol_short values are lowercased 7-char Rust strings.
//
// Canonical topics (current event_logger.rs):
//   ("cred",    "issued")    → CredentialIssued
//   ("cred",    "revoked")   → CredentialRevoked
//   ("course",  "created")   → CourseCreated
//   ("enroll",  "created")   → EnrollmentCreated
//   ("ach",     "minted")    → AchievementMinted
//   ("pay",     "received")  → PaymentReceived
//   ("profile", "update")    → ProfileUpdated
//
// Legacy topics (older contract deployments – kept for backward compatibility):
//   ("course",  "completed") → EnrollmentCreated  (was log_course_completion)
//   ("ach",     "earn")      → AchievementMinted  (was log_user_achievement pre-rename)
// ---------------------------------------------------------------------------
export const TOPIC_TO_EVENT_TYPE: Record<string, IndexedEventType> = {
  // ── Canonical topics ──────────────────────────────────────────────────
  'cred:issued'    : IndexedEventType.CredentialIssued,
  'cred:revoked'   : IndexedEventType.CredentialRevoked,
  'course:created' : IndexedEventType.CourseCreated,
  'enroll:created' : IndexedEventType.EnrollmentCreated,
  'ach:minted'     : IndexedEventType.AchievementMinted,
  'pay:received'   : IndexedEventType.PaymentReceived,
  'profile:update' : IndexedEventType.ProfileUpdated,
  // ── Legacy / backward-compat aliases ─────────────────────────────────
  'course:completed': IndexedEventType.EnrollmentCreated,
  'ach:earn'        : IndexedEventType.AchievementMinted,
};

// ---------------------------------------------------------------------------
// Database row shape (matches the indexed_events table schema)
// ---------------------------------------------------------------------------
export interface IndexedEvent {
  /** Auto-generated UUID primary key */
  id: string;
  /** Soroban contract address that emitted the event */
  contract_id: string;
  /** Stellar ledger sequence number */
  ledger: number;
  /** Position of the event within the ledger (0-based) */
  event_index: number;
  /** Resolved canonical event type */
  event_type: IndexedEventType | string;
  /** Raw Soroban topic values (stringified XDR symbols) */
  topic: string[];
  /** Decoded event payload – structure varies by event_type */
  payload: IndexedEventPayload;
  /** Timestamp when the row was written by the indexer */
  processed_at: Date;
  /** Row creation timestamp */
  created_at: Date;
}

// ---------------------------------------------------------------------------
// Typed payload shapes for each event type.
// All fields are optional so that a partial or malformed event can still be
// stored – the indexer logs and skips missing fields rather than crashing.
// ---------------------------------------------------------------------------

export interface CredentialIssuedPayload {
  recipient?: string;
  credential_id?: string | number;
  course_id?: string;
  issuer?: string;
  metadata?: Record<string, unknown>;
}

export interface CredentialRevokedPayload {
  credential_id?: string | number;
  revoker?: string;
  reason?: string;
}

export interface CourseCreatedPayload {
  course_id?: string;
  creator?: string;
  title?: string;
  metadata?: Record<string, unknown>;
}

export interface EnrollmentCreatedPayload {
  student?: string;
  course_id?: string;
  enrolled_at?: number;
}

export interface AchievementMintedPayload {
  recipient?: string;
  achievement_id?: string | number;
  achievement_type?: string;
  metadata?: Record<string, unknown>;
}

export interface PaymentReceivedPayload {
  payer?: string;
  recipient?: string;
  amount?: string | number;
  asset?: string;
  course_id?: string;
  tx_hash?: string;
}

export interface ProfileUpdatedPayload {
  user?: string;
  updated_fields?: string[];
  metadata?: Record<string, unknown>;
}

export type IndexedEventPayload =
  | CredentialIssuedPayload
  | CredentialRevokedPayload
  | CourseCreatedPayload
  | EnrollmentCreatedPayload
  | AchievementMintedPayload
  | PaymentReceivedPayload
  | ProfileUpdatedPayload
  | Record<string, unknown>;

// ---------------------------------------------------------------------------
// DTO used when inserting a new event row
// ---------------------------------------------------------------------------
export interface CreateIndexedEventDto {
  contract_id: string;
  ledger: number;
  event_index: number;
  event_type: string;
  topic: string[];
  payload: IndexedEventPayload;
}

// ---------------------------------------------------------------------------
// Indexer checkpoint row shape (matches indexer_checkpoints table)
// ---------------------------------------------------------------------------
export interface IndexerCheckpoint {
  id: number;
  checkpoint_key: string;
  last_ledger: number;
  updated_at: Date;
}

// ---------------------------------------------------------------------------
// Runtime status reported by the indexer (used by the health endpoint)
// ---------------------------------------------------------------------------
export interface IndexerStatus {
  status: 'running' | 'stopped' | 'error';
  lastLedger: number;
  eventsProcessed: number;
  lag: number;          // current network ledger − last indexed ledger
  errorMessage?: string;
  startedAt?: string;
}
