/**
 * AuditLogService Unit Tests
 *
 * The database module is mocked globally in tests/setup.js to prevent
 * loading the real PostgreSQL pool. This test imports the already-mocked
 * database module and overrides its `query` implementation on a per-test
 * basis using a sequential response queue.
 */

import crypto from 'crypto';
import { AuditEventType, AuditSeverity } from '../../src/models/AuditLog';
import * as db from '../../src/utils/database';
import { auditLogService } from '../../src/services/auditLogService';

// ── Response queue ─────────────────────────────────────────────────────────
let mockCalls: { text: string; params: any[] }[] = [];
let responseQueue: any[] = [];

const mockQueryImpl = jest.fn((_text: string, _params?: any[]) => {
  mockCalls.push({ text: _text, params: _params || [] });
  const response = responseQueue.shift();
  if (response === undefined) return Promise.resolve({ rows: [] });
  if (response instanceof Error) return Promise.reject(response);
  return Promise.resolve(response);
});

// ── Helpers ────────────────────────────────────────────────────────────────

function makeDbRow(overrides: Partial<any> = {}): any {
  const ts = new Date().toISOString();
  return {
    id: 1, event_type: AuditEventType.LOGIN_SUCCESS, severity: AuditSeverity.INFO,
    actor_id: 'user-1', actor_role: 'student', target_id: null, target_type: null,
    details: JSON.stringify({}), ip_address: null, user_agent: null,
    status: 'success', prev_hash: 'GENESIS', entry_hash: '', created_at: ts,
    ...overrides,
  };
}

function buildExpectedHash(
  prevHash: string, eventType: string, actorId: string, targetId: string,
  details: Record<string, any>, timestamp: string, status: string,
): string {
  const hashInput = [prevHash, eventType, actorId, targetId || '',
    JSON.stringify(details), timestamp, status].join('||');
  return crypto.createHash('sha256').update(hashInput).digest('hex');
}

function q(rows: any[]): void { responseQueue.push({ rows }); }
function qErr(err: any): void {
  responseQueue.push(err instanceof Error ? err : new Error(err));
}
function qInsert(row: any): void { q([]); q([row]); }

// ═══════════════════════════════════════════════════════════════════════════
describe('AuditLogService', () => {
  beforeEach(() => {
    mockCalls = [];
    responseQueue = [];
    // Replace the globally-mocked query with our custom implementation.
    // auditLogService already holds a reference to the same `db.query`
    // function object, so overriding .mockImplementation affects it.
    (db.query as jest.Mock).mockImplementation(mockQueryImpl);
  });

  // ── createEntry ──────────────────────────────────────────────────────────
  describe('createEntry', () => {
    it('should create entry with correct hash from GENESIS', async () => {
      const ts = new Date().toISOString();
      const row = makeDbRow({ id: 1, event_type: AuditEventType.LOGIN_FAILED,
        severity: AuditSeverity.WARNING, actor_id: 'actor-1', actor_role: 'unknown',
        status: 'failure',
        details: JSON.stringify({ reason: 'Invalid password', email: 'test@test.com' }),
        prev_hash: 'GENESIS', created_at: ts });
      row.entry_hash = buildExpectedHash('GENESIS', AuditEventType.LOGIN_FAILED,
        'actor-1', '', { reason: 'Invalid password', email: 'test@test.com' }, ts, 'failure');
      qInsert(row);

      const entry = await auditLogService.logFailedAuth('actor-1',
        { reason: 'Invalid password', email: 'test@test.com' });

      expect(entry.eventType).toBe(AuditEventType.LOGIN_FAILED);
      expect(entry.severity).toBe(AuditSeverity.WARNING);
      expect(entry.status).toBe('failure');
      expect(entry.actorId).toBe('actor-1');
      expect(entry.actorRole).toBe('unknown');
      expect(entry.prevHash).toBe('GENESIS');
      expect(entry.entryHash).toBe(row.entry_hash);
      expect(entry.details).toEqual({ reason: 'Invalid password', email: 'test@test.com' });
    });

    it('should chain from previous entry hash', async () => {
      const ts = new Date().toISOString();
      const prevHash = 'abc123prev';
      const row = makeDbRow({ id: 2, event_type: AuditEventType.LOGIN_SUCCESS,
        actor_id: 'user-2', actor_role: 'student', prev_hash: prevHash, created_at: ts,
        details: JSON.stringify({ method: 'jwt' }) });
      row.entry_hash = buildExpectedHash(prevHash, AuditEventType.LOGIN_SUCCESS,
        'user-2', '', { method: 'jwt' }, ts, 'success');
      q([{ entry_hash: prevHash }]);
      q([row]);

      const entry = await auditLogService.logSuccessfulAuth('user-2', 'student');
      expect(entry.prevHash).toBe(prevHash);
      expect(entry.entryHash).toBe(row.entry_hash);
      expect(entry.id).toBe(2);
    });

    it('should assign CRITICAL severity for Account locked', async () => {
      const row = makeDbRow({ severity: AuditSeverity.CRITICAL,
        event_type: AuditEventType.LOGIN_FAILED, status: 'failure',
        details: JSON.stringify({ reason: 'Account locked' }) });
      row.entry_hash = buildExpectedHash('GENESIS', AuditEventType.LOGIN_FAILED,
        'actor-1', '', { reason: 'Account locked' }, row.created_at, 'failure');
      qInsert(row);

      const entry = await auditLogService.logFailedAuth('actor-1', { reason: 'Account locked' });
      expect(entry.severity).toBe(AuditSeverity.CRITICAL);
    });

    it('should propagate database errors on insert', async () => {
      q([]); qErr('DB connection lost');
      await expect(auditLogService.createEntry({
        eventType: AuditEventType.LOGIN_FAILED, actorId: 'x' }))
        .rejects.toThrow('DB connection lost');
    });

    it('should apply defaults for missing optional fields', async () => {
      const row = makeDbRow({ id: 99, actor_role: 'unknown', severity: AuditSeverity.INFO });
      row.entry_hash = buildExpectedHash('GENESIS', AuditEventType.LOGIN_SUCCESS,
        'actor-minimal', '', {}, row.created_at, 'success');
      qInsert(row);

      const entry = await auditLogService.createEntry({
        eventType: AuditEventType.LOGIN_SUCCESS, actorId: 'actor-minimal' });
      expect(entry.actorRole).toBe('unknown');
      expect(entry.severity).toBe(AuditSeverity.INFO);
      expect(entry.status).toBe('success');
      expect(entry.details).toEqual({});
    });

    it('should store target and IP metadata', async () => {
      const row = makeDbRow({ id: 42, event_type: AuditEventType.ROLE_CHANGED,
        target_id: 'target-user-1', target_type: 'user', ip_address: '192.168.1.1',
        details: JSON.stringify({ oldRole: 'student', newRole: 'instructor' }) });
      row.entry_hash = buildExpectedHash('GENESIS', AuditEventType.ROLE_CHANGED,
        'admin-1', 'target-user-1', { oldRole: 'student', newRole: 'instructor' },
        row.created_at, 'success');
      qInsert(row);

      const entry = await auditLogService.logRoleChange('admin-1', 'admin',
        'target-user-1', { oldRole: 'student', newRole: 'instructor' }, '192.168.1.1');
      expect(entry.targetId).toBe('target-user-1');
      expect(entry.targetType).toBe('user');
      expect(entry.ipAddress).toBe('192.168.1.1');
    });
  });

  // ── Convenience methods ──────────────────────────────────────────────────
  describe('Convenience methods', () => {
    it('logFailedAuth → LOGIN_FAILED + failure status', async () => {
      const row = makeDbRow({ event_type: AuditEventType.LOGIN_FAILED, status: 'failure' });
      row.entry_hash = buildExpectedHash('GENESIS', AuditEventType.LOGIN_FAILED,
        'u1', '', { reason: 'Bad password' }, row.created_at, 'failure');
      qInsert(row);
      const entry = await auditLogService.logFailedAuth('u1', { reason: 'Bad password' });
      expect(entry.eventType).toBe(AuditEventType.LOGIN_FAILED);
      expect(entry.status).toBe('failure');
    });

    it('logSuccessfulAuth → LOGIN_SUCCESS', async () => {
      const row = makeDbRow({ event_type: AuditEventType.LOGIN_SUCCESS });
      row.entry_hash = buildExpectedHash('GENESIS', AuditEventType.LOGIN_SUCCESS,
        'u1', '', { method: 'jwt' }, row.created_at, 'success');
      qInsert(row);
      const entry = await auditLogService.logSuccessfulAuth('u1', 'student');
      expect(entry.eventType).toBe(AuditEventType.LOGIN_SUCCESS);
      expect(entry.actorRole).toBe('student');
    });

    it('logRoleChange → ROLE_CHANGED + CRITICAL', async () => {
      const row = makeDbRow({ event_type: AuditEventType.ROLE_CHANGED, severity: AuditSeverity.CRITICAL, target_id: 'tgt' });
      row.entry_hash = buildExpectedHash('GENESIS', AuditEventType.ROLE_CHANGED,
        'admin', 'tgt', { oldRole: 'student', newRole: 'admin' }, row.created_at, 'success');
      qInsert(row);
      const entry = await auditLogService.logRoleChange('admin', 'admin', 'tgt',
        { oldRole: 'student', newRole: 'admin' });
      expect(entry.eventType).toBe(AuditEventType.ROLE_CHANGED);
      expect(entry.severity).toBe(AuditSeverity.CRITICAL);
    });

    it('logPermissionChange grant → PERMISSION_GRANTED', async () => {
      const row = makeDbRow({ event_type: AuditEventType.PERMISSION_GRANTED });
      row.entry_hash = buildExpectedHash('GENESIS', AuditEventType.PERMISSION_GRANTED,
        'a', 'u', { action: 'grant', permission: 'course:create' }, row.created_at, 'success');
      qInsert(row);
      const entry = await auditLogService.logPermissionChange('a', 'admin', 'u',
        { action: 'grant', permission: 'course:create' });
      expect(entry.eventType).toBe(AuditEventType.PERMISSION_GRANTED);
    });

    it('logPermissionChange revoke → PERMISSION_REVOKED', async () => {
      const row = makeDbRow({ event_type: AuditEventType.PERMISSION_REVOKED });
      row.entry_hash = buildExpectedHash('GENESIS', AuditEventType.PERMISSION_REVOKED,
        'a', 'u', { action: 'revoke', permission: 'course:create' }, row.created_at, 'success');
      qInsert(row);
      const entry = await auditLogService.logPermissionChange('a', 'admin', 'u',
        { action: 'revoke', permission: 'course:create' });
      expect(entry.eventType).toBe(AuditEventType.PERMISSION_REVOKED);
    });

    it('logCredentialIssued → CREDENTIAL_ISSUED + target', async () => {
      const row = makeDbRow({ event_type: AuditEventType.CREDENTIAL_ISSUED, target_id: 'cred-123' });
      row.entry_hash = buildExpectedHash('GENESIS', AuditEventType.CREDENTIAL_ISSUED,
        'issuer', 'cred-123', { recipientId: 'recv', credentialType: 'degree' },
        row.created_at, 'success');
      qInsert(row);
      const entry = await auditLogService.logCredentialIssued('issuer', 'instructor',
        'cred-123', { recipientId: 'recv', credentialType: 'degree' });
      expect(entry.eventType).toBe(AuditEventType.CREDENTIAL_ISSUED);
      expect(entry.targetId).toBe('cred-123');
    });

    it('logCredentialRevoked → CREDENTIAL_REVOKED + CRITICAL', async () => {
      const row = makeDbRow({ event_type: AuditEventType.CREDENTIAL_REVOKED, severity: AuditSeverity.CRITICAL });
      row.entry_hash = buildExpectedHash('GENESIS', AuditEventType.CREDENTIAL_REVOKED,
        'admin', 'cred-456', { recipientId: 'recv', reason: 'Fraud' },
        row.created_at, 'success');
      qInsert(row);
      const entry = await auditLogService.logCredentialRevoked('admin', 'admin',
        'cred-456', { recipientId: 'recv', reason: 'Fraud' });
      expect(entry.eventType).toBe(AuditEventType.CREDENTIAL_REVOKED);
      expect(entry.severity).toBe(AuditSeverity.CRITICAL);
    });

    it('logAdminAction → custom event type', async () => {
      const row = makeDbRow({ event_type: AuditEventType.ADMIN_SETTINGS_UPDATED, severity: AuditSeverity.WARNING });
      row.entry_hash = buildExpectedHash('GENESIS', AuditEventType.ADMIN_SETTINGS_UPDATED,
        'admin', '', { category: 'security', settings: { mfa: true } },
        row.created_at, 'success');
      qInsert(row);
      const entry = await auditLogService.logAdminAction('admin', 'admin',
        AuditEventType.ADMIN_SETTINGS_UPDATED,
        { category: 'security', settings: { mfa: true } });
      expect(entry.eventType).toBe(AuditEventType.ADMIN_SETTINGS_UPDATED);
      expect(entry.severity).toBe(AuditSeverity.WARNING);
    });
  });

  // ── queryEntries ─────────────────────────────────────────────────────────
  describe('queryEntries', () => {
    // Promise.all([countQuery, dataQuery]) — countQuery fires first.
    function qQuery(dataRows: any[], total: number) {
      q([{ total: String(total) }]); // count first
      q(dataRows);                    // data second
    }

    it('should return entries and total count', async () => {
      qQuery([makeDbRow({ id: 1 }), makeDbRow({ id: 2 })], 2);
      const result = await auditLogService.queryEntries();
      expect(result.entries.length).toBe(2);
      expect(result.totalCount).toBe(2);
    });

    it('should filter by single eventType', async () => {
      qQuery([makeDbRow({ id: 1 })], 1);
      const result = await auditLogService.queryEntries({ eventType: AuditEventType.LOGIN_FAILED });
      expect(mockCalls.some(c => c.params.includes(AuditEventType.LOGIN_FAILED))).toBe(true);
      expect(result.entries.length).toBe(1);
    });

    it('should filter by array of eventTypes using ANY', async () => {
      qQuery([makeDbRow({ id: 1 })], 1);
      await auditLogService.queryEntries({
        eventType: [AuditEventType.LOGIN_FAILED, AuditEventType.LOGIN_SUCCESS] });
      expect(mockCalls.some(c => c.text.includes('ANY'))).toBe(true);
    });

    it('should filter by severity', async () => {
      qQuery([makeDbRow({ severity: AuditSeverity.CRITICAL })], 1);
      const result = await auditLogService.queryEntries({ severity: AuditSeverity.CRITICAL });
      expect(result.entries[0].severity).toBe(AuditSeverity.CRITICAL);
    });

    it('should filter by actorId', async () => {
      qQuery([makeDbRow({ actor_id: 'specific-actor' })], 1);
      const result = await auditLogService.queryEntries({ actorId: 'specific-actor' });
      expect(result.entries[0].actorId).toBe('specific-actor');
    });

    it('should filter by targetId', async () => {
      qQuery([makeDbRow({ target_id: 'target-xyz' })], 1);
      const result = await auditLogService.queryEntries({ targetId: 'target-xyz' });
      expect(result.entries[0].targetId).toBe('target-xyz');
    });

    it('should filter by targetType', async () => {
      qQuery([makeDbRow({ target_type: 'credential' })], 1);
      const result = await auditLogService.queryEntries({ targetType: 'credential' });
      expect(result.entries[0].targetType).toBe('credential');
    });

    it('should filter by status', async () => {
      qQuery([makeDbRow({ status: 'failure' })], 1);
      const result = await auditLogService.queryEntries({ status: 'failure' });
      expect(result.entries[0].status).toBe('failure');
    });

    it('should filter by date range', async () => {
      const sd = new Date('2024-01-01'); const ed = new Date('2024-12-31');
      qQuery([makeDbRow()], 1);
      await auditLogService.queryEntries({ startDate: sd, endDate: ed });
      const dataQuery = mockCalls.find(c => c.text.includes('ORDER BY'));
      expect(dataQuery!.params).toContain(sd);
      expect(dataQuery!.params).toContain(ed);
    });

    it('should search details text', async () => {
      qQuery([makeDbRow()], 1);
      await auditLogService.queryEntries({ search: 'password' });
      expect(mockCalls.some(c => c.params.includes('%password%'))).toBe(true);
    });

    it('should handle sortBy and sortOrder', async () => {
      qQuery([makeDbRow({ id: 1 })], 1);
      await auditLogService.queryEntries({ sortBy: 'severity', sortOrder: 'asc' });
      expect(mockCalls.some(c => c.text.includes('ORDER BY severity ASC'))).toBe(true);
    });

    it('should default sort to created_at DESC for invalid sortBy', async () => {
      qQuery([makeDbRow()], 1);
      await auditLogService.queryEntries({ sortBy: 'invalidField' as any, sortOrder: 'desc' });
      expect(mockCalls.some(c => c.text.includes('ORDER BY created_at DESC'))).toBe(true);
    });

    it('should clamp limit between 1 and 100', async () => {
      qQuery([], 0);
      await auditLogService.queryEntries({ limit: 0 });
      expect(mockCalls.some(c => c.params.includes(1))).toBe(true);

      mockCalls = []; // within-test clear is OK, not read by mock closure
      qQuery([], 0);
      await auditLogService.queryEntries({ limit: 500 });
      expect(mockCalls.some(c => c.params.includes(100))).toBe(true);
    });

    it('should clamp negative offset to 0', async () => {
      qQuery([], 0);
      await auditLogService.queryEntries({ offset: -5 });
      expect(mockCalls.some(c => c.params.includes(0))).toBe(true);
    });

    it('should skip eventType filter for empty array', async () => {
      qQuery([makeDbRow({ id: 1 })], 1);
      await auditLogService.queryEntries({ eventType: [] });
      expect(mockCalls.some(c => c.text.includes('event_type'))).toBe(false);
    });

    it('should combine sortBy with other filters', async () => {
      qQuery([makeDbRow({ id: 1 })], 1);
      await auditLogService.queryEntries({ actorId: 'a', sortBy: 'eventType', sortOrder: 'asc' });
      const dq = mockCalls.find(c => c.text.includes('ORDER BY'))!;
      expect(dq.text).toContain('ORDER BY event_type ASC');
      expect(dq.text).toContain('actor_id');
    });

    it('should combine multiple filters', async () => {
      qQuery([makeDbRow({ actor_id: 'a', status: 'failure' })], 1);
      const result = await auditLogService.queryEntries({
        actorId: 'a', status: 'failure', severity: AuditSeverity.WARNING });
      const dq = mockCalls.find(c => c.text.includes('ORDER BY'))!;
      expect(dq.text).toContain('actor_id');
      expect(dq.text).toContain('status');
      expect(dq.text).toContain('severity');
      expect(result.entries.length).toBe(1);
    });

    it('should return empty arrays when no results', async () => {
      qQuery([], 0);
      const result = await auditLogService.queryEntries({ actorId: 'nonexistent' });
      expect(result.entries).toEqual([]);
      expect(result.totalCount).toBe(0);
    });
  });

  // ── getEntryById ─────────────────────────────────────────────────────────
  describe('getEntryById', () => {
    it('should return found entry', async () => {
      q([makeDbRow({ id: 5 })]);
      const entry = await auditLogService.getEntryById(5);
      expect(entry).not.toBeNull();
      expect(entry!.id).toBe(5);
    });

    it('should return null when not found', async () => {
      q([]);
      expect(await auditLogService.getEntryById(999)).toBeNull();
    });

    it('should return null on database error', async () => {
      qErr('DB error');
      expect(await auditLogService.getEntryById(1)).toBeNull();
    });

    it('should parse details JSON string to object', async () => {
      q([makeDbRow({ id: 7, details: JSON.stringify({ key: 'value', nested: { a: 1 } }) })]);
      const entry = await auditLogService.getEntryById(7);
      expect(entry!.details).toEqual({ key: 'value', nested: { a: 1 } });
    });

    it('should handle malformed JSON gracefully', async () => {
      q([makeDbRow({ id: 8, details: '{invalid json' })]);
      expect((await auditLogService.getEntryById(8))!.details).toEqual({});
    });

    it('should handle details as object (not string)', async () => {
      q([makeDbRow({ id: 88, details: { foo: 'bar' } })]);
      expect((await auditLogService.getEntryById(88))!.details).toEqual({ foo: 'bar' });
    });

    it('should map null target columns to undefined', async () => {
      q([makeDbRow({ id: 50, target_id: null, target_type: null })]);
      const entry = await auditLogService.getEntryById(50);
      expect(entry!.targetId).toBeUndefined();
      expect(entry!.targetType).toBeUndefined();
    });

    it('should handle null rows from database', async () => {
      q(null as any);
      expect(await auditLogService.getEntryById(1)).toBeNull();
    });
  });

  // ── verifyIntegrity ──────────────────────────────────────────────────────
  describe('verifyIntegrity', () => {
    it('should verify a valid 3-entry chain as intact', async () => {
      const t1 = '2024-01-01T00:00:00.000Z'; const t2 = '2024-01-02T00:00:00.000Z';
      const t3 = '2024-01-03T00:00:00.000Z';
      const h1 = buildExpectedHash('GENESIS', 'LOGIN_FAILED', 'u1', '',
        { reason: 'a' }, t1, 'failure');
      const h2 = buildExpectedHash(h1, 'LOGIN_SUCCESS', 'u2', '',
        { method: 'jwt' }, t2, 'success');
      const h3 = buildExpectedHash(h2, 'ROLE_CHANGED', 'a', 't',
        { oldRole: 's', newRole: 'i' }, t3, 'success');
      q([
        { id: 1, event_type: 'LOGIN_FAILED', actor_id: 'u1', target_id: null,
          details: JSON.stringify({ reason: 'a' }), created_at: t1,
          prev_hash: 'GENESIS', entry_hash: h1, status: 'failure' },
        { id: 2, event_type: 'LOGIN_SUCCESS', actor_id: 'u2', target_id: null,
          details: JSON.stringify({ method: 'jwt' }), created_at: t2,
          prev_hash: h1, entry_hash: h2, status: 'success' },
        { id: 3, event_type: 'ROLE_CHANGED', actor_id: 'a', target_id: 't',
          details: JSON.stringify({ oldRole: 's', newRole: 'i' }), created_at: t3,
          prev_hash: h2, entry_hash: h3, status: 'success' },
      ]);
      const result = await auditLogService.verifyIntegrity();
      expect(result.valid).toBe(true);
      expect(result.totalEntries).toBe(3);
      expect(result.mismatches).toEqual([]);
    });

    it('should detect a tampered entry', async () => {
      q([{ id: 1, event_type: 'LOGIN_FAILED', actor_id: 'u1', target_id: null,
        details: JSON.stringify({ reason: 'r' }),
        created_at: '2024-06-01T00:00:00.000Z',
        prev_hash: 'GENESIS', entry_hash: 'baadf00dbaadf00dbaadf00dbaadf00d',
        status: 'failure' }]);
      const result = await auditLogService.verifyIntegrity();
      expect(result.valid).toBe(false);
      expect(result.mismatches).toEqual([1]);
      expect(result.firstMismatchIndex).toBe(1);
    });

    it('should handle empty audit log', async () => {
      q([]);
      const result = await auditLogService.verifyIntegrity();
      expect(result.valid).toBe(true);
      expect(result.totalEntries).toBe(0);
    });
  });

  // ── verifyIntegrityRange ─────────────────────────────────────────────────
  describe('verifyIntegrityRange', () => {
    it('should verify a valid range', async () => {
      const ts = '2024-05-01T00:00:00.000Z';
      const hash = buildExpectedHash('GENESIS', 'LOGIN_SUCCESS', 'u', '',
        { method: 'jwt' }, ts, 'success');
      q([{ id: 5, event_type: 'LOGIN_SUCCESS', actor_id: 'u', target_id: null,
        details: JSON.stringify({ method: 'jwt' }), created_at: ts,
        prev_hash: 'GENESIS', entry_hash: hash, status: 'success' }]);
      const result = await auditLogService.verifyIntegrityRange(5, 5);
      expect(result.valid).toBe(true);
    });

    it('should detect tampering in a range', async () => {
      q([{ id: 10, event_type: 'CREDENTIAL_ISSUED', actor_id: 'i', target_id: 'c',
        details: JSON.stringify({}), created_at: '2024-01-01T00:00:00.000Z',
        prev_hash: 'GENESIS', entry_hash: 'tampered-hash', status: 'success' }]);
      const result = await auditLogService.verifyIntegrityRange(10, 10);
      expect(result.valid).toBe(false);
    });
  });

  // ── getStatistics ────────────────────────────────────────────────────────
  describe('getStatistics', () => {
    function qStats(t: number, byT: any[], byS: any[], bySt: any[]) {
      q([{ total: String(t) }]); q(byT); q(byS); q(bySt);
    }

    it('should return counts by event type, severity, and status', async () => {
      qStats(10,
        [{ event_type: 'LOGIN_FAILED', count: '5' }, { event_type: 'LOGIN_SUCCESS', count: '5' }],
        [{ severity: 'WARNING', count: '6' }, { severity: 'INFO', count: '4' }],
        [{ status: 'success', count: '7' }, { status: 'failure', count: '3' }]);
      const stats = await auditLogService.getStatistics();
      expect(stats.totalEntries).toBe(10);
      expect(stats.byEventType.LOGIN_FAILED).toBe(5);
      expect(stats.byEventType.LOGIN_SUCCESS).toBe(5);
      expect(stats.bySeverity.WARNING).toBe(6);
      expect(stats.bySeverity.INFO).toBe(4);
      expect(stats.byStatus.success).toBe(7);
      expect(stats.byStatus.failure).toBe(3);
    });

    it('should filter by startDate', async () => {
      qStats(3, [], [], []);
      const result = await auditLogService.getStatistics({ startDate: new Date('2024-06-01') });
      expect(result.totalEntries).toBe(3);
    });

    it('should filter by both startDate and endDate', async () => {
      qStats(5, [], [], []);
      const result = await auditLogService.getStatistics({
        startDate: new Date('2024-01-01'), endDate: new Date('2024-06-30') });
      expect(result.totalEntries).toBe(5);
    });

    it('should return zeros on database error', async () => {
      qErr('DB down');
      const stats = await auditLogService.getStatistics();
      expect(stats.totalEntries).toBe(0);
    });
  });

  // ── Edge cases ───────────────────────────────────────────────────────────
  describe('Edge cases', () => {
    it('should fall back to GENESIS when table does not exist (42P01)', async () => {
      const tableError: any = new Error('relation "audit_logs" does not exist');
      tableError.code = '42P01';
      const row = makeDbRow();
      row.entry_hash = buildExpectedHash('GENESIS', AuditEventType.LOGIN_SUCCESS, 'a', '',
        { method: 'jwt' }, row.created_at, 'success');
      qErr(tableError);
      q([row]);

      const entry = await auditLogService.logSuccessfulAuth('a', 'student');
      expect(entry.prevHash).toBe('GENESIS');
    });

    it('should fall back to GENESIS on other DB errors with warning', async () => {
      const otherError: any = new Error('Connection timeout');
      otherError.code = 'ETIMEDOUT';
      const row = makeDbRow();
      row.entry_hash = buildExpectedHash('GENESIS', AuditEventType.LOGIN_SUCCESS, 'a', '',
        { method: 'jwt' }, row.created_at, 'success');
      qErr(otherError);
      q([row]);

      const entry = await auditLogService.logSuccessfulAuth('a', 'student');
      expect(entry.prevHash).toBe('GENESIS');
    });

    it('should handle empty queryEntries result', async () => {
      q([{ total: '0' }]); q([]);
      const result = await auditLogService.queryEntries();
      expect(result.entries).toEqual([]);
      expect(result.totalCount).toBe(0);
    });
  });
});
