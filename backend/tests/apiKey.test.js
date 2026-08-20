const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const ApiKey = require('../src/models/ApiKey');
const { authenticateApiKey, requireScope } = require('../src/middleware/apiKey');

// ── Model Tests ──────────────────────────────────────────────

describe('ApiKey Model', () => {
  describe('generateKey', () => {
    test('should return rawKey, keyHash, and keyPrefix', async () => {
      const { rawKey, keyHash, keyPrefix } = await ApiKey.generateKey();

      expect(rawKey).toMatch(/^sk_[a-f0-9]{48}$/);
      expect(keyPrefix).toBe(rawKey.slice(0, 7));
      expect(typeof keyHash).toBe('string');
      expect(keyHash).not.toBe(rawKey);
    });

    test('should produce different keys on successive calls', async () => {
      const k1 = await ApiKey.generateKey();
      const k2 = await ApiKey.generateKey();
      expect(k1.rawKey).not.toBe(k2.rawKey);
    });
  });

  describe('verifyKey', () => {
    test('should return true for a matching key', async () => {
      const { rawKey, keyHash } = await ApiKey.generateKey();
      const result = await ApiKey.verifyKey(rawKey, keyHash);
      expect(result).toBe(true);
    });

    test('should return false for a non-matching key', async () => {
      const { keyHash } = await ApiKey.generateKey();
      const result = await ApiKey.verifyKey('sk_wrongkey', keyHash);
      expect(result).toBe(false);
    });
  });

  describe('Schema validation', () => {
    test('should save a valid API key document', async () => {
      const { keyHash, keyPrefix } = await ApiKey.generateKey();
      const doc = new ApiKey({
        keyHash,
        keyPrefix,
        userId: new mongoose.Types.ObjectId(),
        name: 'Test Key',
        scopes: ['courses:read', 'content:write'],
        audit: [{ action: 'created', performedBy: new mongoose.Types.ObjectId() }],
      });
      const saved = await doc.save();
      expect(saved._id).toBeDefined();
      expect(saved.status).toBe('active');
      expect(saved.scopes).toEqual(['courses:read', 'content:write']);
      expect(saved.audit).toHaveLength(1);
      expect(saved.audit[0].action).toBe('created');
    });

    test('should reject a document without required fields', async () => {
      const doc = new ApiKey({ name: 'Incomplete' });
      await expect(doc.save()).rejects.toThrow();
    });
  });
});

// ── Middleware Tests ──────────────────────────────────────────

describe('apiKey Middleware', () => {
  let testKeyDoc;
  let rawKey;

  beforeEach(async () => {
    const generated = await ApiKey.generateKey();
    rawKey = generated.rawKey;

    testKeyDoc = await ApiKey.create({
      keyHash: generated.keyHash,
      keyPrefix: generated.keyPrefix,
      userId: new mongoose.Types.ObjectId(),
      name: 'Middleware Test Key',
      scopes: ['courses:read', 'content:write'],
      audit: [{ action: 'created', performedBy: new mongoose.Types.ObjectId() }],
    });
  });

  describe('authenticateApiKey', () => {
    test('should call next() when no x-api-key header is present', async () => {
      const req = { headers: {}, ip: '127.0.0.1' };
      const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
      const next = jest.fn();

      await authenticateApiKey(req, res, next);
      expect(next).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
    });

    test('should attach user and apiKey to req on valid key', async () => {
      const req = { headers: { 'x-api-key': rawKey }, ip: '127.0.0.1' };
      const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
      const next = jest.fn();

      await authenticateApiKey(req, res, next);
      expect(next).toHaveBeenCalled();
      expect(req.user).toBeDefined();
      expect(req.user.role).toBe('api_user');
      expect(req.apiKey).toBeDefined();
      expect(req.apiKey._id.toString()).toBe(testKeyDoc._id.toString());
    });

    test('should return 401 for an invalid key', async () => {
      const req = { headers: { 'x-api-key': 'sk_invalidkey123456789012345678901234' }, ip: '127.0.0.1' };
      const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
      const next = jest.fn();

      await authenticateApiKey(req, res, next);
      expect(res.status).toHaveBeenCalledWith(401);
      expect(next).not.toHaveBeenCalled();
    });

    test('should reject a revoked key', async () => {
      testKeyDoc.status = 'revoked';
      await testKeyDoc.save();

      const req = { headers: { 'x-api-key': rawKey }, ip: '127.0.0.1' };
      const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
      const next = jest.fn();

      await authenticateApiKey(req, res, next);
      expect(res.status).toHaveBeenCalledWith(401);
      expect(next).not.toHaveBeenCalled();
    });

    test('should reject an expired key', async () => {
      testKeyDoc.expiresAt = new Date(Date.now() - 10000); // expired
      await testKeyDoc.save();

      const req = { headers: { 'x-api-key': rawKey }, ip: '127.0.0.1' };
      const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
      const next = jest.fn();

      await authenticateApiKey(req, res, next);
      expect(res.status).toHaveBeenCalledWith(401);
      expect(next).not.toHaveBeenCalled();
    });
  });

  describe('requireScope', () => {
    test('should call next() when no apiKey is on req (JWT flow)', () => {
      const req = {};
      const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
      const next = jest.fn();

      requireScope('courses:read')(req, res, next);
      expect(next).toHaveBeenCalled();
    });

    test('should call next() when key has the required scope', () => {
      const req = { apiKey: { scopes: ['courses:read', 'content:write'] } };
      const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
      const next = jest.fn();

      requireScope('courses:read')(req, res, next);
      expect(next).toHaveBeenCalled();
    });

    test('should call next() when key has wildcard scope', () => {
      const req = { apiKey: { scopes: ['*'] } };
      const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
      const next = jest.fn();

      requireScope('anything:at_all')(req, res, next);
      expect(next).toHaveBeenCalled();
    });

    test('should return 403 when key lacks the required scope', () => {
      const req = { apiKey: { scopes: ['courses:read'] } };
      const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
      const next = jest.fn();

      requireScope('admin:panel')(req, res, next);
      expect(res.status).toHaveBeenCalledWith(403);
      expect(next).not.toHaveBeenCalled();
    });

    test('should accept any one of multiple required scopes', () => {
      const req = { apiKey: { scopes: ['content:read'] } };
      const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
      const next = jest.fn();

      requireScope(['admin:panel', 'content:read'])(req, res, next);
      expect(next).toHaveBeenCalled();
    });
  });
});

// ── Admin Endpoint Tests ─────────────────────────────────────

describe('Admin API Key Endpoints', () => {
  const request = require('supertest');
  const app = require('../src/index');
  const jwt = require('jsonwebtoken');

  let adminToken;
  let adminUserId;

  beforeEach(() => {
    adminUserId = new mongoose.Types.ObjectId().toString();
    adminToken = jwt.sign(
      { id: adminUserId, role: 'admin', userId: adminUserId },
      process.env.JWT_SECRET || 'test-jwt-secret',
      { expiresIn: '1h' }
    );
  });

  describe('POST /api/v1/admin/api-keys', () => {
    test('should create an API key and return the plaintext key', async () => {
      const res = await request(app)
        .post('/api/v1/admin/api-keys')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'Integration Key', scopes: ['courses:read'] })
        .expect(201);

      expect(res.body.success).toBe(true);
      expect(res.body.data.key).toMatch(/^sk_[a-f0-9]{48}$/);
      expect(res.body.data.name).toBe('Integration Key');
      expect(res.body.data.scopes).toEqual(['courses:read']);
      expect(res.body.data.id).toBeDefined();
    });

    test('should reject creation without name', async () => {
      await request(app)
        .post('/api/v1/admin/api-keys')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ scopes: ['courses:read'] })
        .expect(400);
    });

    test('should reject creation without scopes', async () => {
      await request(app)
        .post('/api/v1/admin/api-keys')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'No Scopes' })
        .expect(400);
    });

    test('should reject unauthenticated requests', async () => {
      await request(app)
        .post('/api/v1/admin/api-keys')
        .send({ name: 'Key', scopes: ['courses:read'] })
        .expect(401);
    });
  });

  describe('GET /api/v1/admin/api-keys', () => {
    test('should list API keys', async () => {
      // Create a key first
      await request(app)
        .post('/api/v1/admin/api-keys')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'List Test', scopes: ['content:read'] });

      const res = await request(app)
        .get('/api/v1/admin/api-keys')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.keys).toBeInstanceOf(Array);
      expect(res.body.data.keys.length).toBeGreaterThan(0);
      expect(res.body.data.pagination).toBeDefined();
      // Key hash should never be exposed
      expect(res.body.data.keys[0].keyHash).toBeUndefined();
    });
  });

  describe('POST /api/v1/admin/api-keys/:id/rotate', () => {
    test('should rotate a key and return the new plaintext key', async () => {
      // Create
      const createRes = await request(app)
        .post('/api/v1/admin/api-keys')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'Rotate Test', scopes: ['courses:read'] });

      const keyId = createRes.body.data.id;

      // Rotate
      const rotateRes = await request(app)
        .post(`/api/v1/admin/api-keys/${keyId}/rotate`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ scopes: ['courses:read', 'content:write'] })
        .expect(200);

      expect(rotateRes.body.success).toBe(true);
      expect(rotateRes.body.data.key).toMatch(/^sk_[a-f0-9]{48}$/);
      expect(rotateRes.body.data.scopes).toEqual(['courses:read', 'content:write']);
      expect(rotateRes.body.data.oldKeyId).toBe(keyId);
    });

    test('should return 404 for a non-existent key', async () => {
      const fakeId = new mongoose.Types.ObjectId().toString();
      await request(app)
        .post(`/api/v1/admin/api-keys/${fakeId}/rotate`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({})
        .expect(404);
    });
  });

  describe('DELETE /api/v1/admin/api-keys/:id', () => {
    test('should revoke a key', async () => {
      // Create
      const createRes = await request(app)
        .post('/api/v1/admin/api-keys')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'Revoke Test', scopes: ['content:read'] });

      const keyId = createRes.body.data.id;

      // Revoke
      const deleteRes = await request(app)
        .delete(`/api/v1/admin/api-keys/${keyId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(deleteRes.body.success).toBe(true);
      expect(deleteRes.body.data.status).toBe('revoked');
    });

    test('should return 404 for a non-existent key', async () => {
      const fakeId = new mongoose.Types.ObjectId().toString();
      await request(app)
        .delete(`/api/v1/admin/api-keys/${fakeId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(404);
    });
  });

  describe('Scope enforcement integration', () => {
    test('should reject API key access when scope is missing', async () => {
      // Create a key with limited scopes
      const createRes = await request(app)
        .post('/api/v1/admin/api-keys')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'Scoped Key', scopes: ['content:read'] });

      const rawKey = createRes.body.data.key;

      // Use the key on an endpoint that requires a different scope
      // The authenticateApiKey middleware authenticates the key and sets req.user as api_user.
      // The requirePermission(SYSTEM_MANAGE) check then rejects because api_user lacks that permission.
      const res = await request(app)
        .get('/api/v1/admin/api-keys')
        .set('x-api-key', rawKey)
        .expect(403); // api_user role does not have SYSTEM_MANAGE permission

      expect(res.body.error).toBe('Insufficient permissions');
    });
  });
});
