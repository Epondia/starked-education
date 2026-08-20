const crypto = require('crypto');
const { getClient, query } = require('../utils/database');
const logger = require('../utils/logger');

const GENESIS_HASH = '0'.repeat(64);
const SENSITIVE_KEY = /(password|token|secret|authorization|cookie|private.?key|api.?key|credit.?card|ssn)/i;

function redact(value, depth = 0) {
  if (depth > 5 || value === null || value === undefined) return value;
  if (Array.isArray(value)) return value.map((item) => redact(item, depth + 1));
  if (typeof value !== 'object') return value;

  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [
      key,
      SENSITIVE_KEY.test(key) ? '[REDACTED]' : redact(item, depth + 1),
    ]),
  );
}

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === 'object') {
    return Object.keys(value)
      .sort()
      .reduce((result, key) => {
        result[key] = stableValue(value[key]);
        return result;
      }, {});
  }
  return value;
}

function hashPayload(payload) {
  return crypto
    .createHash('sha256')
    .update(JSON.stringify(stableValue(payload)))
    .digest('hex');
}

function hashActorIdentifier(identifier) {
  return crypto.createHash('sha256').update(String(identifier).trim().toLowerCase()).digest('hex');
}

function toAuditRecord(row) {
  return {
    id: row.id,
    actorId: row.actor_id,
    actorRole: row.actor_role,
    action: row.action,
    resourceType: row.resource_type,
    resourceId: row.resource_id,
    outcome: row.outcome,
    statusCode: row.status_code,
    requestId: row.request_id,
    ipAddress: row.ip_address,
    userAgent: row.user_agent,
    details: row.details,
    previousHash: row.previous_hash,
    entryHash: row.entry_hash,
    occurredAt: row.occurred_at,
    createdAt: row.created_at,
  };
}

class AuditLogService {
  constructor(database = { getClient, query }) {
    this.getClient = database.getClient;
    this.query = database.query;
  }

  async record(event) {
    const client = await this.getClient();
    const occurredAt = event.occurredAt || new Date().toISOString();
    const details = redact(event.details || {});

    const payload = {
      actorId: event.actorId || null,
      actorRole: event.actorRole || null,
      action: event.action,
      resourceType: event.resourceType || null,
      resourceId: event.resourceId || null,
      outcome: event.outcome || 'success',
      statusCode: event.statusCode || null,
      requestId: event.requestId || null,
      ipAddress: event.ipAddress || null,
      userAgent: event.userAgent || null,
      details,
      occurredAt,
    };

    try {
      await client.query('BEGIN');
      // Serialize writers so every entry has one unambiguous predecessor.
      await client.query("SELECT pg_advisory_xact_lock(hashtext('starked:audit-log'))");
      const previous = await client.query(
        'SELECT entry_hash FROM audit_logs ORDER BY id DESC LIMIT 1',
      );
      const previousHash = previous.rows[0]?.entry_hash || GENESIS_HASH;
      const hashablePayload = { ...payload, previousHash };
      const entryHash = hashPayload(hashablePayload);

      const result = await client.query(
        `INSERT INTO audit_logs
          (actor_id, actor_role, action, resource_type, resource_id, outcome,
           status_code, request_id, ip_address, user_agent, details, payload,
           previous_hash, entry_hash, occurred_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::jsonb, $12::jsonb,
                 $13, $14, $15)
         RETURNING *`,
        [
          payload.actorId,
          payload.actorRole,
          payload.action,
          payload.resourceType,
          payload.resourceId,
          payload.outcome,
          payload.statusCode,
          payload.requestId,
          payload.ipAddress,
          payload.userAgent,
          JSON.stringify(details),
          JSON.stringify(hashablePayload),
          previousHash,
          entryHash,
          occurredAt,
        ],
      );

      await client.query('COMMIT');
      return toAuditRecord(result.rows[0]);
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      logger.error('Failed to persist audit log:', error);
      return null;
    } finally {
      client.release();
    }
  }

  async list(filters = {}) {
    const page = Math.max(1, Number.parseInt(filters.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, Number.parseInt(filters.limit, 10) || 50));
    const params = [];
    const clauses = [];

    const add = (sql, value) => {
      params.push(value);
      clauses.push(sql.replace('?', `$${params.length}`));
    };

    if (filters.action) add('action = ?', filters.action);
    if (filters.actorId) add('actor_id = ?', filters.actorId);
    if (filters.outcome) add('outcome = ?', filters.outcome);
    if (filters.startDate) add('occurred_at >= ?', filters.startDate);
    if (filters.endDate) add('occurred_at <= ?', filters.endDate);
    if (filters.search) {
      const search = `%${String(filters.search).slice(0, 100)}%`;
      const firstIndex = params.length + 1;
      params.push(search, search, search);
      clauses.push(`(action ILIKE $${firstIndex} OR resource_id ILIKE $${firstIndex + 1} OR request_id ILIKE $${firstIndex + 2})`);
    }

    const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
    const countResult = await this.query(`SELECT COUNT(*)::int AS total FROM audit_logs ${where}`, params);
    const offset = (page - 1) * limit;
    const dataResult = await this.query(
      `SELECT id, actor_id, actor_role, action, resource_type, resource_id, outcome,
              status_code, request_id, ip_address, user_agent, details, previous_hash,
              entry_hash, occurred_at, created_at
       FROM audit_logs ${where} ORDER BY id DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, limit, offset],
    );

    const total = countResult.rows[0]?.total || 0;
    return {
      data: dataResult.rows.map(toAuditRecord),
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    };
  }

  async verifyChain(limit = 10000) {
    const result = await this.query(
      'SELECT id, previous_hash, entry_hash, payload FROM audit_logs ORDER BY id ASC LIMIT $1',
      [Math.min(10000, Math.max(1, Number.parseInt(limit, 10) || 10000))],
    );
    let previousHash = GENESIS_HASH;

    for (const row of result.rows) {
      if (row.previous_hash !== previousHash || hashPayload(row.payload) !== row.entry_hash) {
        return { valid: false, checked: result.rows.indexOf(row), invalidEntryId: row.id };
      }
      previousHash = row.entry_hash;
    }

    return { valid: true, checked: result.rows.length, invalidEntryId: null };
  }
}

module.exports = {
  AuditLogService,
  auditLogService: new AuditLogService(),
  hashActorIdentifier,
  redact,
  hashPayload,
  GENESIS_HASH,
};
