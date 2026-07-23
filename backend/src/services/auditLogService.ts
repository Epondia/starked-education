/**
 * AuditLogService
 * Comprehensive audit logging service for security-sensitive operations.
 *
 * Features:
 *   - Tamper-evident hash chaining (SHA-256)
 *   - Logging for credential issuance/revocation, role changes, failed auth, admin actions
 *   - Search and filtering for admin audit log viewer
 *   - Integrity verification
 */

import crypto from 'crypto';
import { query } from '../utils/database';
import logger from '../utils/logger';
import {
  AuditEventType,
  AuditSeverity,
  AuditLogFilter,
  IAuditLogEntry,
} from '../models/AuditLog';

interface CreateAuditEntryParams {
  eventType: AuditEventType;
  severity?: AuditSeverity;
  actorId: string;
  actorRole?: string;
  targetId?: string;
  targetType?: string;
  details?: Record<string, any>;
  ipAddress?: string;
  userAgent?: string;
  status?: 'success' | 'failure';
}

class AuditLogService {
  /**
   * Create a new tamper-evident audit log entry.
   * Hash chain: entry_hash = SHA-256(prev_hash || event_type || actor_id || target_id || details_json || timestamp)
   */
  public async createEntry(params: CreateAuditEntryParams): Promise<IAuditLogEntry> {
    const {
      eventType,
      severity = AuditSeverity.INFO,
      actorId,
      actorRole = 'unknown',
      targetId = null,
      targetType = null,
      details = {},
      ipAddress = null,
      userAgent = null,
      status = 'success',
    } = params;

    try {
      // Get the hash of the most recent entry to build the chain
      const prevHash = await this.getLatestHash();

      const detailsJson = JSON.stringify(details);
      const timestamp = new Date().toISOString();

      // Build the hash input: prev_hash || event_type || actor_id || target_id || details_json || timestamp || status
      const hashInput = [
        prevHash,
        eventType,
        actorId,
        targetId || '',
        detailsJson,
        timestamp,
        status,
      ].join('||');

      const entryHash = crypto.createHash('sha256').update(hashInput).digest('hex');

      const result = await query(
        `INSERT INTO audit_logs
           (event_type, severity, actor_id, actor_role, target_id, target_type,
            details, ip_address, user_agent, status, prev_hash, entry_hash, created_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
         RETURNING *`,
        [
          eventType,
          severity,
          actorId,
          actorRole,
          targetId,
          targetType,
          detailsJson,
          ipAddress,
          userAgent,
          status,
          prevHash,
          entryHash,
          timestamp,
        ]
      );

      const entry = this.mapRowToEntry(result.rows[0]);
      logger.debug(`[AUDIT] ${eventType} by ${actorId}${targetId ? ` on ${targetId}` : ''} (${status})`);
      return entry;
    } catch (error) {
      logger.error(`Failed to create audit log entry for ${eventType}:`, error);
      throw error;
    }
  }

  /**
   * Query audit logs with comprehensive filtering and pagination.
   * This powers the admin audit log viewer.
   */
  public async queryEntries(filter: AuditLogFilter = {}): Promise<{
    entries: IAuditLogEntry[];
    totalCount: number;
  }> {
    const {
      eventType,
      severity,
      actorId,
      targetId,
      targetType,
      status,
      startDate,
      endDate,
      limit = 50,
      offset = 0,
      sortBy = 'createdAt',
      sortOrder = 'desc',
      search,
    } = filter;

    const conditions: string[] = [];
    const params: any[] = [];
    let paramIndex = 1;

    // Event type filter - supports single value or array
    if (eventType) {
      if (Array.isArray(eventType) && eventType.length > 0) {
        conditions.push(`event_type = ANY($${paramIndex++})`);
        params.push(eventType);
      } else if (typeof eventType === 'string') {
        conditions.push(`event_type = $${paramIndex++}`);
        params.push(eventType);
      }
    }

    if (severity) {
      conditions.push(`severity = $${paramIndex++}`);
      params.push(severity);
    }

    if (actorId) {
      conditions.push(`actor_id = $${paramIndex++}`);
      params.push(actorId);
    }

    if (targetId) {
      conditions.push(`target_id = $${paramIndex++}`);
      params.push(targetId);
    }

    if (targetType) {
      conditions.push(`target_type = $${paramIndex++}`);
      params.push(targetType);
    }

    if (status) {
      conditions.push(`status = $${paramIndex++}`);
      params.push(status);
    }

    if (startDate) {
      conditions.push(`created_at >= $${paramIndex++}`);
      params.push(startDate);
    }

    if (endDate) {
      conditions.push(`created_at <= $${paramIndex++}`);
      params.push(endDate);
    }

    // Full-text search on details JSONB
    if (search) {
      conditions.push(`details::text ILIKE $${paramIndex++}`);
      params.push(`%${search}%`);
    }

    const whereClause = conditions.length > 0
      ? `WHERE ${conditions.join(' AND ')}`
      : '';

    // Use explicit switch for sort column to satisfy CodeQL taint analysis.
    // The sort field is validated against a fixed allowlist; no dynamic SQL.
    let dbSort: string;
    switch (sortBy) {
      case 'severity':   dbSort = 'severity';   break;
      case 'eventType':  dbSort = 'event_type'; break;
      default:           dbSort = 'created_at'; break;
    }
    const dbOrder = sortOrder === 'asc' ? 'ASC' : 'DESC';

    const safeLimit = Math.min(Math.max(1, limit), 100);
    const safeOffset = Math.max(0, offset);

    // codeql[js/sql-injection] — all filter values are parameterized via $N placeholders;
    // the dynamic WHERE clause is assembled from hard-coded column-name fragments.
    const countQuery = `SELECT COUNT(*) as total FROM audit_logs ${whereClause}`;
    // codeql[js/sql-injection] — same rationale as countQuery above.
    const dataQuery = `SELECT * FROM audit_logs ${whereClause} ORDER BY ${dbSort} ${dbOrder} LIMIT $${paramIndex++} OFFSET $${paramIndex++}`;

    const countParams = [...params];
    const dataParams = [...params, safeLimit, safeOffset];

    const [countResult, dataResult] = await Promise.all([
      query(countQuery, countParams),
      query(dataQuery, dataParams),
    ]);

    return {
      entries: (dataResult.rows || []).map((row: any) => this.mapRowToEntry(row)),
      totalCount: parseInt(countResult.rows[0]?.total || '0', 10),
    };
  }

  /**
   * Get a single audit log entry by ID.
   */
  public async getEntryById(id: number): Promise<IAuditLogEntry | null> {
    try {
      const result = await query('SELECT * FROM audit_logs WHERE id = $1', [id]);
      if (!result.rows || result.rows.length === 0) return null;
      return this.mapRowToEntry(result.rows[0]);
    } catch (error) {
      logger.error(`Error fetching audit log entry ${id}:`, error);
      return null;
    }
  }

  /**
   * Verify the integrity of the entire audit log chain.
   * Recomputes each entry's hash and compares against the stored value.
   */
  public async verifyIntegrity(): Promise<{
    valid: boolean;
    totalEntries: number;
    mismatches: number[];
    firstMismatchIndex?: number;
  }> {
    try {
      const result = await query(
        'SELECT * FROM audit_logs ORDER BY id ASC'
      );

      const rows = result.rows || [];
      const mismatches: number[] = [];

      for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        const prevHash = i === 0 ? 'GENESIS' : rows[i - 1].entry_hash;
        const detailsJson = typeof row.details === 'string' ? row.details : JSON.stringify(row.details);

        const hashInput = [
          prevHash,
          row.event_type,
          row.actor_id,
          row.target_id || '',
          detailsJson,
          row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at,
          row.status,
        ].join('||');

        const computedHash = crypto.createHash('sha256').update(hashInput).digest('hex');

        if (computedHash !== row.entry_hash) {
          mismatches.push(row.id);
        }
      }

      return {
        valid: mismatches.length === 0,
        totalEntries: rows.length,
        mismatches,
        firstMismatchIndex: mismatches.length > 0 ? mismatches[0] : undefined,
      };
    } catch (error) {
      logger.error('Error verifying audit log integrity:', error);
      throw error;
    }
  }

  /**
   * Verify a specific range of entries in the audit log chain.
   */
  public async verifyIntegrityRange(
    startId: number,
    endId: number
  ): Promise<{ valid: boolean; mismatches: number[] }> {
    try {
      const result = await query(
        'SELECT * FROM audit_logs WHERE id BETWEEN $1 AND $2 ORDER BY id ASC',
        [startId, endId]
      );

      const rows = result.rows || [];
      const mismatches: number[] = [];

      for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        const prevHash = row.prev_hash;
        const detailsJson = typeof row.details === 'string' ? row.details : JSON.stringify(row.details);

        const hashInput = [
          prevHash,
          row.event_type,
          row.actor_id,
          row.target_id || '',
          detailsJson,
          row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at,
          row.status,
        ].join('||');

        const computedHash = crypto.createHash('sha256').update(hashInput).digest('hex');

        if (computedHash !== row.entry_hash) {
          mismatches.push(row.id);
        }
      }

      return {
        valid: mismatches.length === 0,
        mismatches,
      };
    } catch (error) {
      logger.error('Error verifying audit log range integrity:', error);
      throw error;
    }
  }

  /**
   * Get audit log statistics (counts by event type, severity, status).
   */
  public async getStatistics(filter?: {
    startDate?: Date;
    endDate?: Date;
  }): Promise<{
    totalEntries: number;
    byEventType: Record<string, number>;
    bySeverity: Record<string, number>;
    byStatus: Record<string, number>;
  }> {
    try {
      const conditions: string[] = [];
      const params: any[] = [];
      let paramIndex = 1;

      if (filter?.startDate) {
        conditions.push(`created_at >= $${paramIndex++}`);
        params.push(filter.startDate);
      }
      if (filter?.endDate) {
        conditions.push(`created_at <= $${paramIndex++}`);
        params.push(filter.endDate);
      }

      const whereClause = conditions.length > 0
        ? `WHERE ${conditions.join(' AND ')}`
        : '';

      // codeql[js/sql-injection]
      const qTotal  = `SELECT COUNT(*) as total FROM audit_logs ${whereClause}`;
      // codeql[js/sql-injection]
      const qByType = `SELECT event_type, COUNT(*) as count FROM audit_logs ${whereClause} GROUP BY event_type`;
      // codeql[js/sql-injection]
      const qBySev  = `SELECT severity, COUNT(*) as count FROM audit_logs ${whereClause} GROUP BY severity`;
      // codeql[js/sql-injection]
      const qByStat = `SELECT status, COUNT(*) as count FROM audit_logs ${whereClause} GROUP BY status`;

      const [totalResult, eventTypeResult, severityResult, statusResult] = await Promise.all([
        query(qTotal, params),
        query(qByType, params),
        query(qBySev, params),
        query(qByStat, params),
      ]);

      const byEventType: Record<string, number> = {};
      (eventTypeResult.rows || []).forEach((r: any) => {
        byEventType[r.event_type] = parseInt(r.count, 10);
      });

      const bySeverity: Record<string, number> = {};
      (severityResult.rows || []).forEach((r: any) => {
        bySeverity[r.severity] = parseInt(r.count, 10);
      });

      const byStatus: Record<string, number> = {};
      (statusResult.rows || []).forEach((r: any) => {
        byStatus[r.status] = parseInt(r.count, 10);
      });

      return {
        totalEntries: parseInt(totalResult.rows[0]?.total || '0', 10),
        byEventType,
        bySeverity,
        byStatus,
      };
    } catch (error) {
      logger.error('Error fetching audit log statistics:', error);
      return {
        totalEntries: 0,
        byEventType: {},
        bySeverity: {},
        byStatus: {},
      };
    }
  }

  /**
   * Convenience methods for specific event types.
   * These make it easy to log from middleware and other services.
   */

  /** Log a failed login attempt */
  public async logFailedAuth(
    actorId: string,
    details: { reason: string; email?: string },
    ipAddress?: string,
    userAgent?: string
  ): Promise<IAuditLogEntry> {
    return this.createEntry({
      eventType: AuditEventType.LOGIN_FAILED,
      severity: details.reason === 'Account locked' ? AuditSeverity.CRITICAL : AuditSeverity.WARNING,
      actorId,
      actorRole: 'unknown',
      details,
      ipAddress,
      userAgent,
      status: 'failure',
    });
  }

  /** Log a successful login */
  public async logSuccessfulAuth(
    actorId: string,
    actorRole: string,
    ipAddress?: string,
    userAgent?: string
  ): Promise<IAuditLogEntry> {
    return this.createEntry({
      eventType: AuditEventType.LOGIN_SUCCESS,
      severity: AuditSeverity.INFO,
      actorId,
      actorRole,
      details: { method: 'jwt' },
      ipAddress,
      userAgent,
      status: 'success',
    });
  }

  /** Log a role change (admin assigning a new role to a user) */
  public async logRoleChange(
    adminId: string,
    adminRole: string,
    targetUserId: string,
    details: { oldRole: string; newRole: string; reason?: string },
    ipAddress?: string
  ): Promise<IAuditLogEntry> {
    return this.createEntry({
      eventType: AuditEventType.ROLE_CHANGED,
      severity: AuditSeverity.CRITICAL,
      actorId: adminId,
      actorRole: adminRole,
      targetId: targetUserId,
      targetType: 'user',
      details,
      ipAddress,
      status: 'success',
    });
  }

  /** Log a permission grant/revocation */
  public async logPermissionChange(
    adminId: string,
    adminRole: string,
    targetUserId: string,
    details: { action: 'grant' | 'revoke'; permission: string; scope?: string },
    ipAddress?: string
  ): Promise<IAuditLogEntry> {
    return this.createEntry({
      eventType: details.action === 'grant'
        ? AuditEventType.PERMISSION_GRANTED
        : AuditEventType.PERMISSION_REVOKED,
      severity: AuditSeverity.WARNING,
      actorId: adminId,
      actorRole: adminRole,
      targetId: targetUserId,
      targetType: 'user',
      details,
      ipAddress,
      status: 'success',
    });
  }

  /** Log a credential issuance */
  public async logCredentialIssued(
    actorId: string,
    actorRole: string,
    credentialId: string,
    details: { recipientId: string; credentialType: string; courseId?: string },
    ipAddress?: string
  ): Promise<IAuditLogEntry> {
    return this.createEntry({
      eventType: AuditEventType.CREDENTIAL_ISSUED,
      severity: AuditSeverity.INFO,
      actorId,
      actorRole,
      targetId: credentialId,
      targetType: 'credential',
      details,
      ipAddress,
      status: 'success',
    });
  }

  /** Log a credential revocation */
  public async logCredentialRevoked(
    actorId: string,
    actorRole: string,
    credentialId: string,
    details: { recipientId: string; reason: string },
    ipAddress?: string
  ): Promise<IAuditLogEntry> {
    return this.createEntry({
      eventType: AuditEventType.CREDENTIAL_REVOKED,
      severity: AuditSeverity.CRITICAL,
      actorId,
      actorRole,
      targetId: credentialId,
      targetType: 'credential',
      details,
      ipAddress,
      status: 'success',
    });
  }

  /** Log a general admin action */
  public async logAdminAction(
    adminId: string,
    adminRole: string,
    eventType: AuditEventType,
    details: Record<string, any>,
    ipAddress?: string,
    userAgent?: string
  ): Promise<IAuditLogEntry> {
    return this.createEntry({
      eventType,
      severity: AuditSeverity.WARNING,
      actorId: adminId,
      actorRole: adminRole,
      details,
      ipAddress,
      userAgent,
      status: 'success',
    });
  }

  // --- Private helpers ---

  /**
   * Get the hash of the most recent audit log entry.
   * Returns 'GENESIS' for the first entry (genesis block pattern).
   */
  private async getLatestHash(): Promise<string> {
    try {
      const result = await query(
        'SELECT entry_hash FROM audit_logs ORDER BY id DESC LIMIT 1'
      );
      if (result.rows && result.rows.length > 0) {
        return result.rows[0].entry_hash;
      }
    } catch (error: any) {
      // Table might not exist yet
      if (error.code !== '42P01' && error.code !== '42P02') {
        logger.warn('Error getting latest audit hash:', error);
      }
    }
    return 'GENESIS';
  }

  /**
   * Map a database row to an IAuditLogEntry interface.
   */
  private mapRowToEntry(row: any): IAuditLogEntry {
    let details = row.details;
    if (typeof details === 'string') {
      try {
        details = JSON.parse(details);
      } catch {
        details = {};
      }
    }

    return {
      id: row.id,
      eventType: row.event_type as AuditEventType,
      severity: row.severity as AuditSeverity,
      actorId: row.actor_id,
      actorRole: row.actor_role,
      targetId: row.target_id || undefined,
      targetType: row.target_type || undefined,
      details: details || {},
      ipAddress: row.ip_address || undefined,
      userAgent: row.user_agent || undefined,
      status: row.status as 'success' | 'failure',
      prevHash: row.prev_hash,
      entryHash: row.entry_hash,
      createdAt: row.created_at,
    };
  }
}

export const auditLogService = new AuditLogService();
