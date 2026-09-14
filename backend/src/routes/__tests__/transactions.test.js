/**
 * Authorization tests for the transactions router (issue #383).
 *
 * Asserts the IDOR fix: unauthenticated calls get 401, and a user accessing
 * another user's transactions gets 403. The data-layer dependencies are
 * mocked so the tests run without Mongo/Redis/Stellar.
 */

jest.mock('../../models/Transaction', () => {
  const store = new Map();
  return {
    __seed(transaction) {
      store.set(transaction.id, transaction);
    },
    __clear() {
      store.clear();
    },
    findOne: jest.fn(async ({ id }) => store.get(id) || null),
    findByUser: jest.fn(async (userId) =>
      Array.from(store.values()).filter((t) => String(t.userId) === String(userId)),
    ),
    countDocuments: jest.fn(async (query) =>
      Array.from(store.values()).filter(
        (t) =>
          String(t.userId) === String(query.userId) &&
          (!query.status || t.status === query.status) &&
          (!query.type || t.type === query.type),
      ).length,
    ),
  };
});

jest.mock('../../services/transactionQueue', () => ({
  // The real module exports `{ TransactionQueue, transactionQueue }`; the
  // router destructures `{ transactionQueue }`, so the mock must mirror that.
  transactionQueue: {
    enqueueTransaction: jest.fn(async (value) => ({
      id: `tx_${Date.now()}`,
      userId: value.userId,
      type: value.type,
      status: 'pending',
      priority: value.priority || 'medium',
      createdAt: new Date(),
    })),
    getQueuePosition: jest.fn(async () => 0),
    getUserPendingTransactions: jest.fn(async () => []),
    getQueueStats: jest.fn(async () => ({})),
    clearQueue: jest.fn(async () => {}),
  },
  TransactionQueue: jest.fn(),
}));

jest.mock('../../workers/transactionProcessor', () => ({
  getStats: jest.fn(() => ({})),
  retryFailedTransactions: jest.fn(async () => 0),
}));

jest.mock('../../events/transactionEvents', () => ({
  getStats: jest.fn(() => ({})),
  getUserRecentEvents: jest.fn(async () => []),
}));

jest.mock('../../utils/stellarUtils', () => ({
  validateAddress: jest.fn(() => true),
  getTransactionStatus: jest.fn(async () => null),
  getAccount: jest.fn(async () => ({})),
  getAccountBalances: jest.fn(async () => []),
  getFeeStats: jest.fn(async () => ({})),
  estimateSmartFee: jest.fn(async () => 100000),
}));

jest.mock('../../middleware/rateLimiter', () => ({
  transactionLimiter: (req, res, next) => next(),
}));

// `tests/setup.js` boots the full app (with the real data-layer modules)
// before this file runs. Reset the module registry so the mocks above apply
// to a freshly evaluated router.
jest.resetModules();

const request = require('supertest');
const express = require('express');
const jwt = require('jsonwebtoken');
const Transaction = require('../../models/Transaction');
const transactionQueue = require('../../services/transactionQueue').transactionQueue;
const transactionsRouter = require('../transactions');

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/v1/transactions', transactionsRouter);
  return app;
}

function tokenFor(userId, role = 'student') {
  return jwt.sign({ id: userId, username: 'test', role }, process.env.JWT_SECRET);
}

function makeTransaction(id, userId, overrides = {}) {
  return {
    id,
    userId,
    type: 'payment',
    status: 'failed',
    priority: 'medium',
    sourceAccount: 'G_TEST',
    destinationAccount: 'G_DEST',
    amount: '10',
    retryCount: 1,
    maxRetries: 3,
    lastError: null,
    metadata: {},
    createdAt: new Date(),
    updatedAt: new Date(),
    canRetry: () => true,
    resetForRetry: jest.fn(),
    ...overrides,
  };
}

describe('transactions router authorization (issue #383)', () => {
  const app = buildApp();

  beforeEach(() => {
    Transaction.__clear();
    Transaction.__seed(makeTransaction('tx-owned', 'user-1'));
    Transaction.__seed(makeTransaction('tx-other', 'user-2'));
    jest.clearAllMocks();
  });

  describe('GET /:transactionId', () => {
    test('401 when no token is provided', async () => {
      const res = await request(app).get('/api/v1/transactions/tx-owned');
      expect(res.status).toBe(401);
    });

    test('403 when a user reads another user\'s transaction', async () => {
      const res = await request(app)
        .get('/api/v1/transactions/tx-other')
        .set('Authorization', `Bearer ${tokenFor('user-1')}`);
      expect(res.status).toBe(403);
    });

    test('200 for the owner', async () => {
      const res = await request(app)
        .get('/api/v1/transactions/tx-owned')
        .set('Authorization', `Bearer ${tokenFor('user-1')}`);
      expect(res.status).toBe(200);
      expect(res.body.data.id).toBe('tx-owned');
    });

    test('200 for an admin reading any transaction', async () => {
      const res = await request(app)
        .get('/api/v1/transactions/tx-other')
        .set('Authorization', `Bearer ${tokenFor('admin-user', 'admin')}`);
      expect(res.status).toBe(200);
      expect(res.body.data.id).toBe('tx-other');
    });
  });

  describe('GET /:transactionId/status', () => {
    test('401 without a token', async () => {
      const res = await request(app).get('/api/v1/transactions/tx-owned/status');
      expect(res.status).toBe(401);
    });

    test('403 for another user\'s transaction', async () => {
      const res = await request(app)
        .get('/api/v1/transactions/tx-other/status')
        .set('Authorization', `Bearer ${tokenFor('user-1')}`);
      expect(res.status).toBe(403);
    });

    test('200 for the owner', async () => {
      const res = await request(app)
        .get('/api/v1/transactions/tx-owned/status')
        .set('Authorization', `Bearer ${tokenFor('user-1')}`);
      expect(res.status).toBe(200);
    });
  });

  describe('POST /:transactionId/retry', () => {
    test('401 without a token', async () => {
      const res = await request(app).post('/api/v1/transactions/tx-owned/retry');
      expect(res.status).toBe(401);
    });

    test('403 when retrying another user\'s transaction', async () => {
      const res = await request(app)
        .post('/api/v1/transactions/tx-other/retry')
        .set('Authorization', `Bearer ${tokenFor('user-1')}`);
      expect(res.status).toBe(403);
    });

    test('200 for the owner', async () => {
      const res = await request(app)
        .post('/api/v1/transactions/tx-owned/retry')
        .set('Authorization', `Bearer ${tokenFor('user-1')}`);
      expect(res.status).toBe(200);
    });
  });

  describe('GET / (list)', () => {
    test('401 without a token', async () => {
      const res = await request(app).get('/api/v1/transactions?userId=user-1');
      expect(res.status).toBe(401);
    });

    test('403 when listing another user\'s transactions', async () => {
      const res = await request(app)
        .get('/api/v1/transactions?userId=user-2')
        .set('Authorization', `Bearer ${tokenFor('user-1')}`);
      expect(res.status).toBe(403);
    });

    test('200 listing own transactions', async () => {
      const res = await request(app)
        .get('/api/v1/transactions?userId=user-1')
        .set('Authorization', `Bearer ${tokenFor('user-1')}`);
      expect(res.status).toBe(200);
      expect(res.body.data.transactions).toHaveLength(1);
    });

    test('200 for admin listing any user', async () => {
      const res = await request(app)
        .get('/api/v1/transactions?userId=user-2')
        .set('Authorization', `Bearer ${tokenFor('admin-user', 'admin')}`);
      expect(res.status).toBe(200);
    });
  });

  describe('POST / (create)', () => {
    const validBody = {
      type: 'payment',
      sourceAccount: 'G_TEST',
      destinationAccount: 'G_DEST',
      amount: '10',
    };

    test('401 without a token', async () => {
      const res = await request(app).post('/api/v1/transactions').send(validBody);
      expect(res.status).toBe(401);
    });

    test('derives userId from the JWT, ignoring the caller-supplied userId', async () => {
      const res = await request(app)
        .post('/api/v1/transactions')
        .set('Authorization', `Bearer ${tokenFor('user-1')}`)
        .send({ ...validBody, userId: 'user-999' });
      expect(res.status).toBe(201);
      expect(transactionQueue.enqueueTransaction).toHaveBeenCalledWith(
        expect.objectContaining({ userId: 'user-1' }),
        expect.anything(),
      );
      expect(res.body.data.userId).toBe('user-1');
    });
  });

  describe('GET /user/:userId/* (pending & events)', () => {
    test('401 without a token', async () => {
      const res = await request(app).get('/api/v1/transactions/user/user-1/pending');
      expect(res.status).toBe(401);
    });

    test('403 when accessing another user\'s pending transactions', async () => {
      const res = await request(app)
        .get('/api/v1/transactions/user/user-2/pending')
        .set('Authorization', `Bearer ${tokenFor('user-1')}`);
      expect(res.status).toBe(403);
    });

    test('200 for own pending transactions', async () => {
      const res = await request(app)
        .get('/api/v1/transactions/user/user-1/pending')
        .set('Authorization', `Bearer ${tokenFor('user-1')}`);
      expect(res.status).toBe(200);
    });

    test('403 when reading another user\'s events', async () => {
      const res = await request(app)
        .get('/api/v1/transactions/user/user-2/events')
        .set('Authorization', `Bearer ${tokenFor('user-1')}`);
      expect(res.status).toBe(403);
    });
  });

  describe('admin routes', () => {
    test('POST /admin/clear-queue requires admin role', async () => {
      const anon = await request(app).post('/api/v1/transactions/admin/clear-queue');
      expect(anon.status).toBe(401);

      const student = await request(app)
        .post('/api/v1/transactions/admin/clear-queue')
        .set('Authorization', `Bearer ${tokenFor('user-1')}`);
      expect(student.status).toBe(403);

      const admin = await request(app)
        .post('/api/v1/transactions/admin/clear-queue')
        .set('Authorization', `Bearer ${tokenFor('admin-user', 'admin')}`);
      expect(admin.status).toBe(200);
    });

    test('POST /admin/retry-failed requires admin role', async () => {
      const anon = await request(app).post('/api/v1/transactions/admin/retry-failed');
      expect(anon.status).toBe(401);

      const student = await request(app)
        .post('/api/v1/transactions/admin/retry-failed')
        .set('Authorization', `Bearer ${tokenFor('user-1')}`);
      expect(student.status).toBe(403);

      const admin = await request(app)
        .post('/api/v1/transactions/admin/retry-failed')
        .set('Authorization', `Bearer ${tokenFor('admin-user', 'admin')}`);
      expect(admin.status).toBe(200);
    });
  });

  describe('stellar account route', () => {
    test('GET /stellar/account/:accountId requires a token', async () => {
      const res = await request(app).get('/api/v1/transactions/stellar/account/G_ANY');
      expect(res.status).toBe(401);
    });

    test('200 with a token', async () => {
      const res = await request(app)
        .get('/api/v1/transactions/stellar/account/G_ANY')
        .set('Authorization', `Bearer ${tokenFor('user-1')}`);
      expect(res.status).toBe(200);
    });
  });

  describe('public utility routes stay public', () => {
    test('GET /stellar/fee-stats needs no token', async () => {
      const res = await request(app).get('/api/v1/transactions/stellar/fee-stats');
      expect(res.status).toBe(200);
    });

    test('POST /validate needs no token', async () => {
      const res = await request(app)
        .post('/api/v1/transactions/validate')
        .send({ type: 'payment', sourceAccount: 'G_TEST', destinationAccount: 'G_DEST', amount: '10' });
      expect(res.status).toBe(200);
    });
  });
});
