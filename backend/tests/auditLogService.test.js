const {
  AuditLogService,
  GENESIS_HASH,
  hashPayload,
  redact,
} = require('../src/services/auditLogService');

describe('AuditLogService', () => {
  it('redacts credentials recursively without changing ordinary details', () => {
    expect(redact({
      action: 'login',
      password: 'do-not-store',
      nested: { accessToken: 'also-secret', reason: 'invalid' },
    })).toEqual({
      action: 'login',
      password: '[REDACTED]',
      nested: { accessToken: '[REDACTED]', reason: 'invalid' },
    });
  });

  it('writes a hash-linked entry and commits the transaction', async () => {
    const client = {
      query: jest.fn()
        .mockResolvedValueOnce({})
        .mockResolvedValueOnce({})
        .mockResolvedValueOnce({ rows: [] })
        .mockImplementationOnce(async (_sql, params) => ({
          rows: [{
            id: 1,
            actor_id: params[0],
            actor_role: params[1],
            action: params[2],
            resource_type: params[3],
            resource_id: params[4],
            outcome: params[5],
            status_code: params[6],
            request_id: params[7],
            ip_address: params[8],
            user_agent: params[9],
            details: JSON.parse(params[10]),
            previous_hash: params[12],
            entry_hash: params[13],
            occurred_at: params[14],
          }],
        }))
        .mockResolvedValueOnce({}),
      release: jest.fn(),
    };
    const service = new AuditLogService({
      getClient: jest.fn().mockResolvedValue(client),
      query: jest.fn(),
    });

    const record = await service.record({
      actorId: 'user-1',
      actorRole: 'admin',
      action: 'auth.assign-role',
      resourceType: 'user',
      resourceId: 'user-2',
      requestId: 'request-1',
      details: { password: 'redact-me', reason: 'promotion' },
      occurredAt: '2026-08-20T00:00:00.000Z',
    });

    expect(record.previousHash).toBe(GENESIS_HASH);
    expect(record.details).toEqual({ password: '[REDACTED]', reason: 'promotion' });
    expect(record.entryHash).toMatch(/^[a-f0-9]{64}$/);
    expect(client.query).toHaveBeenCalledWith('COMMIT');
    expect(client.release).toHaveBeenCalledTimes(1);
  });

  it('detects a broken predecessor or payload hash', async () => {
    const payload = {
      actorId: 'user-1',
      actorRole: 'admin',
      action: 'admin.settings',
      resourceType: 'settings',
      resourceId: null,
      outcome: 'success',
      statusCode: 200,
      requestId: 'request-1',
      ipAddress: null,
      userAgent: null,
      details: {},
      occurredAt: '2026-08-20T00:00:00.000Z',
      previousHash: GENESIS_HASH,
    };
    const query = jest.fn().mockResolvedValue({
      rows: [{ id: 1, previous_hash: GENESIS_HASH, entry_hash: hashPayload({ ...payload, action: 'tampered' }), payload }],
    });
    const service = new AuditLogService({ getClient: jest.fn(), query });

    await expect(service.verifyChain()).resolves.toEqual({
      valid: false,
      checked: 0,
      invalidEntryId: 1,
    });
  });
});
