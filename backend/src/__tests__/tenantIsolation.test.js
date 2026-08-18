/**
 * @file tenantIsolation.test.js
 * @description Tests for multi-tenant data isolation guardrails.
 *
 * Covers:
 *   - tenantMiddleware: rejects requests with no tenant context
 *   - ensureTenantUser: blocks cross-tenant user access
 *   - verifyTenantAccess: blocks mismatched :tenantId route params
 *   - withTenantScope: always injects tenantId; throws when tenantId is absent
 *   - requireTenantId: rejects requests missing tenant context
 *   - tenantIsolation: attaches scopedQuery helper
 *   - tenantService.scopedFilter: produces a tenant-scoped filter
 *   - tenantService.assertTenantOwnership: throws on cross-tenant mismatch
 *   - tenantService.validateTenantAccess: rejects invalid ObjectIds
 */

'use strict';

const mongoose = require('mongoose');

// ─── Helpers ──────────────────────────────────────────────────────────────────

const makeObjectId = () => new mongoose.Types.ObjectId();

/** Minimal Express-like response mock */
function makeRes() {
  const res = { statusCode: 200 };
  res.status = jest.fn((code) => { res.statusCode = code; return res; });
  res.json  = jest.fn((body)  => { res.body = body; return res; });
  res.set   = jest.fn(() => res);
  return res;
}

// ─── Module under test ────────────────────────────────────────────────────────

// We mock heavy dependencies so these tests run without a real database.
jest.mock('../models/Tenant');
jest.mock('../models/TenantUser');
jest.mock('../services/tenantService');

const Tenant     = require('../models/Tenant');
const TenantUser = require('../models/TenantUser');

const {
  tenantMiddleware,
  ensureTenantUser,
  verifyTenantAccess,
  withTenantScope,
  requireTenantId,
  tenantIsolation,
  getAuditLog,
} = require('../middleware/tenant');

const tenantService = require('../services/tenantService');

// ─── withTenantScope ─────────────────────────────────────────────────────────

describe('withTenantScope', () => {
  it('merges tenantId into the provided filter', () => {
    const tenantId = makeObjectId();
    const result = withTenantScope({ status: 'active' }, tenantId);
    expect(result).toEqual({ status: 'active', tenantId });
  });

  it('works with an empty filter', () => {
    const tenantId = makeObjectId();
    expect(withTenantScope({}, tenantId)).toEqual({ tenantId });
  });

  it('throws when tenantId is falsy (prevents unscoped queries)', () => {
    expect(() => withTenantScope({ foo: 'bar' }, null)).toThrow();
    expect(() => withTenantScope({ foo: 'bar' }, undefined)).toThrow();
    expect(() => withTenantScope({}, '')).toThrow();
  });

  it('does not mutate the original filter', () => {
    const tenantId = makeObjectId();
    const original = { status: 'active' };
    const result = withTenantScope(original, tenantId);
    expect(original).toEqual({ status: 'active' });
    expect(result).not.toBe(original);
  });
});

// ─── requireTenantId ─────────────────────────────────────────────────────────

describe('requireTenantId', () => {
  it('calls next() when req.tenantId is set', () => {
    const req  = { tenantId: makeObjectId() };
    const res  = makeRes();
    const next = jest.fn();
    requireTenantId(req, res, next);
    expect(next).toHaveBeenCalledTimes(1);
    expect(res.status).not.toHaveBeenCalled();
  });

  it('returns 400 when req.tenantId is absent', () => {
    const req  = {};
    const res  = makeRes();
    const next = jest.fn();
    requireTenantId(req, res, next);
    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.body.code).toBe('TENANT_CONTEXT_MISSING');
  });
});

// ─── tenantIsolation ─────────────────────────────────────────────────────────

describe('tenantIsolation', () => {
  it('attaches scopedQuery helper when tenantId is present', () => {
    const tenantId = makeObjectId();
    const req  = { tenantId };
    const res  = makeRes();
    const next = jest.fn();

    tenantIsolation({})(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(typeof req.scopedQuery).toBe('function');

    const scoped = req.scopedQuery({ status: 'active' });
    expect(scoped).toEqual({ status: 'active', tenantId });
  });

  it('returns 400 when tenantId is absent', () => {
    const req  = {};
    const res  = makeRes();
    const next = jest.fn();
    tenantIsolation({})(req, res, next);
    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(400);
  });
});

// ─── tenantMiddleware ─────────────────────────────────────────────────────────

describe('tenantMiddleware', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns 400 when no tenant info can be extracted from the request', async () => {
    const req  = { hostname: 'localhost', headers: {}, query: {} };
    const res  = makeRes();
    const next = jest.fn();

    await tenantMiddleware(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.body.code).toBe('TENANT_CONTEXT_MISSING');
  });

  it('returns 404 when the tenant is not found in the database', async () => {
    Tenant.findOne = jest.fn().mockResolvedValue(null);

    const req  = { hostname: 'acme.example.com', headers: {}, query: {} };
    const res  = makeRes();
    const next = jest.fn();

    await tenantMiddleware(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.body.code).toBe('TENANT_NOT_FOUND');
  });

  it('returns 403 when the tenant is inactive', async () => {
    Tenant.findOne = jest.fn().mockResolvedValue({
      _id: makeObjectId(),
      name: 'Acme',
      subdomain: 'acme',
      isActive: false,
    });

    const req  = { hostname: 'acme.example.com', headers: {}, query: {} };
    const res  = makeRes();
    const next = jest.fn();

    await tenantMiddleware(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.body.code).toBe('TENANT_INACTIVE');
  });

  it('sets req.tenant and req.tenantId for a valid active tenant', async () => {
    const tenantId = makeObjectId();
    const tenant = { _id: tenantId, name: 'Acme', subdomain: 'acme', isActive: true };
    Tenant.findOne = jest.fn().mockResolvedValue(tenant);

    const req  = { hostname: 'acme.example.com', headers: {}, query: {} };
    const res  = makeRes();
    const next = jest.fn();

    await tenantMiddleware(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(req.tenant).toBe(tenant);
    expect(req.tenantId).toEqual(tenantId);
  });
});

// ─── ensureTenantUser ─────────────────────────────────────────────────────────

describe('ensureTenantUser', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns 401 when req.user is absent', async () => {
    const req  = { tenant: {}, tenantId: makeObjectId() };
    const res  = makeRes();
    const next = jest.fn();

    await ensureTenantUser(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(401);
  });

  it('returns 401 when req.tenant is absent', async () => {
    const req  = { user: { userId: makeObjectId().toString() } };
    const res  = makeRes();
    const next = jest.fn();

    await ensureTenantUser(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(401);
  });

  it('returns 403 when the user ID is not a valid ObjectId (prevents crafted-ID attacks)', async () => {
    const req  = {
      user:     { userId: 'not-an-object-id' },
      tenant:   {},
      tenantId: makeObjectId(),
      originalUrl: '/test',
      method:   'GET',
    };
    const res  = makeRes();
    const next = jest.fn();

    await ensureTenantUser(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.body.code).toBe('CROSS_TENANT_ACCESS_DENIED');
  });

  it('returns 403 and logs an audit entry when the user belongs to a different tenant', async () => {
    TenantUser.findOne = jest.fn().mockResolvedValue(null); // not found in this tenant

    const req  = {
      user:     { userId: makeObjectId().toString() },
      tenant:   {},
      tenantId: makeObjectId(),
      originalUrl: '/api/tenants/123/courses',
      method:   'GET',
    };
    const res  = makeRes();
    const next = jest.fn();

    const auditLengthBefore = getAuditLog().length;
    await ensureTenantUser(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.body.code).toBe('CROSS_TENANT_ACCESS_DENIED');
    // An audit entry should have been written
    expect(getAuditLog().length).toBeGreaterThan(auditLengthBefore);
    const lastEntry = getAuditLog()[getAuditLog().length - 1];
    expect(lastEntry.type).toBe('CROSS_TENANT_USER_DENIED');
  });

  it('attaches tenantUser and calls next() for a valid in-tenant user', async () => {
    const tenantUser = { _id: makeObjectId(), tenantId: makeObjectId() };
    TenantUser.findOne = jest.fn().mockResolvedValue(tenantUser);

    const req  = {
      user:     { userId: tenantUser._id.toString() },
      tenant:   {},
      tenantId: tenantUser.tenantId,
      originalUrl: '/test',
      method:   'GET',
    };
    const res  = makeRes();
    const next = jest.fn();

    await ensureTenantUser(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(req.tenantUser).toBe(tenantUser);
  });
});

// ─── verifyTenantAccess ───────────────────────────────────────────────────────

describe('verifyTenantAccess', () => {
  beforeEach(() => jest.clearAllMocks());

  it('calls next() when the route param is absent', () => {
    const tenantId = makeObjectId();
    const req  = { params: {}, tenantId };
    const res  = makeRes();
    const next = jest.fn();

    verifyTenantAccess('tenantId')(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
  });

  it('returns 400 for a non-ObjectId route param', () => {
    const tenantId = makeObjectId();
    const req  = { params: { tenantId: 'not-an-id' }, tenantId, user: null, originalUrl: '/test', method: 'GET' };
    const res  = makeRes();
    const next = jest.fn();

    verifyTenantAccess('tenantId')(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.body.code).toBe('INVALID_TENANT_ID');
  });

  it('returns 403 when the route param does not match the resolved tenant (cross-tenant attempt)', () => {
    const resolvedTenantId = makeObjectId();
    const differentTenantId = makeObjectId();

    const req  = {
      params:     { tenantId: differentTenantId.toString() },
      tenantId:   resolvedTenantId,
      user:       { userId: makeObjectId().toString() },
      originalUrl: '/api/tenants/' + differentTenantId + '/courses',
      method:     'GET',
    };
    const res  = makeRes();
    const next = jest.fn();

    const auditLengthBefore = getAuditLog().length;
    verifyTenantAccess('tenantId')(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.body.code).toBe('CROSS_TENANT_ACCESS_DENIED');
    expect(getAuditLog().length).toBeGreaterThan(auditLengthBefore);
  });

  it('calls next() when route param matches the resolved tenantId', () => {
    const tenantId = makeObjectId();
    const req  = {
      params:   { tenantId: tenantId.toString() },
      tenantId,
      user:     {},
      originalUrl: '/test',
      method:   'GET',
    };
    const res  = makeRes();
    const next = jest.fn();

    verifyTenantAccess('tenantId')(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(res.status).not.toHaveBeenCalled();
  });
});

// ─── tenantService scoping helpers ───────────────────────────────────────────

describe('tenantService — scopedFilter', () => {
  // We need the real implementation for unit-testing the scoping logic.
  // The module was mocked at the top; unmock it for this describe block.
  let realTenantService;

  beforeAll(() => {
    jest.unmock('../services/tenantService');
    // Clear the module cache so jest.mock above doesn't interfere
    jest.resetModules();
    // Re-require the real module
    realTenantService = require('../services/tenantService');
  });

  it('returns a filter that includes tenantId', () => {
    const tenantId = makeObjectId();
    const filter = realTenantService.scopedFilter(tenantId, { status: 'active' });
    expect(filter.tenantId).toEqual(tenantId);
    expect(filter.status).toBe('active');
  });

  it('throws when tenantId is not provided', () => {
    expect(() => realTenantService.scopedFilter(null)).toThrow();
    expect(() => realTenantService.scopedFilter(undefined, { foo: 1 })).toThrow();
  });

  it('works with an empty additional filter', () => {
    const tenantId = makeObjectId();
    expect(realTenantService.scopedFilter(tenantId)).toEqual({ tenantId });
  });
});

describe('tenantService — assertTenantOwnership', () => {
  let realTenantService;

  beforeAll(() => {
    jest.unmock('../services/tenantService');
    jest.resetModules();
    realTenantService = require('../services/tenantService');
  });

  it('does not throw when the document belongs to the expected tenant', () => {
    const tenantId = makeObjectId();
    const doc = { tenantId };
    expect(() => realTenantService.assertTenantOwnership(doc, tenantId)).not.toThrow();
  });

  it('throws when the document belongs to a different tenant', () => {
    const tenantIdA = makeObjectId();
    const tenantIdB = makeObjectId();
    const doc = { tenantId: tenantIdA };
    expect(() => realTenantService.assertTenantOwnership(doc, tenantIdB)).toThrow();
    try {
      realTenantService.assertTenantOwnership(doc, tenantIdB);
    } catch (err) {
      expect(err.code).toBe('CROSS_TENANT_ACCESS_DENIED');
    }
  });

  it('throws when the document is null or has no tenantId', () => {
    const tenantId = makeObjectId();
    expect(() => realTenantService.assertTenantOwnership(null, tenantId)).toThrow();
    expect(() => realTenantService.assertTenantOwnership({}, tenantId)).toThrow();
  });
});

describe('tenantService — validateTenantAccess', () => {
  let realTenantService;

  beforeAll(() => {
    jest.unmock('../services/tenantService');
    jest.resetModules();
    realTenantService = require('../services/tenantService');
  });

  afterEach(() => jest.clearAllMocks());

  it('throws immediately for a non-ObjectId tenantId (no DB hit)', async () => {
    await expect(realTenantService.validateTenantAccess('not-an-id')).rejects.toThrow(
      'Invalid tenant identifier'
    );
  });

  it('throws for a null tenantId', async () => {
    await expect(realTenantService.validateTenantAccess(null)).rejects.toThrow(
      'Invalid tenant identifier'
    );
  });
});
