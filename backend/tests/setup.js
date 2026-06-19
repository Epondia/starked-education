const mongoose = require('mongoose');

// Mongo-memory is optional. Its binary depends on a download/cache chain
// that may be unavailable in this environment (e.g. minimal dev containers,
// CI runners without a populated `.cache/mongodb-binaries/` folder). Make
// the lifecycle hooks no-ops with a warning if the package or the binary
// cannot be loaded, so non-Mongo test suites (e.g. Issue #28 docs tests)
// can still run end-to-end.
let MongoMemoryServer;
try {
  ({ MongoMemoryServer } = require('mongodb-memory-server'));
} catch (err) {
  console.warn('[setup] mongodb-memory-server unavailable; skipping in-memory Mongo lifecycle:', err.message);
  MongoMemoryServer = null;
}

// Set test environment variables immediately
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-jwt-secret';
process.env.STELLAR_NETWORK = 'testnet';

console.log('Testing in environment:', process.env.NODE_ENV);

const request = require('supertest');

// `app` is intentionally NOT required at the top of the module — see
// `global.testUtils.authenticatedRequest` below for the lazy load. Loading
// `../src/index` here would force every test file to bootstrap the entire
// backend (stellar SDK, IPFS, federated learning / paillier, secure
// aggregation, ...). For documentation-only tests such as
// `tests/openapiDocs.test.js` we never need the Express app, so we keep
// the require inside the helper that actually uses it.

// Mock IPFS service globally
jest.mock('../src/services/ipfs', () => ({
  uploadFile: jest.fn(),
  uploadMultipleFiles: jest.fn(),
  getContent: jest.fn(),
  getMetadata: jest.fn(),
  pinContent: jest.fn(),
  unpinContent: jest.fn(),
  getNodeInfo: jest.fn(),
  getFileMetadata: jest.fn(),
  pinFile: jest.fn(),
  unpinFile: jest.fn(),
  updateFileMetadata: jest.fn()
}));

// (intentionally not loaded here — see comment above `const request = require('supertest');`)
// const app = require('../src/index');

jest.setTimeout(60000);

// Mock external dependencies
jest.mock('@stellar/stellar-sdk');
jest.mock('ipfs-http-client', () => ({
  create: jest.fn(() => ({
    version: jest.fn().mockResolvedValue({ version: '1.0.0' }),
    add: jest.fn().mockResolvedValue({ cid: { toString: () => 'QmTest123456789' } }),
    cat: jest.fn(),
    pin: {
      add: jest.fn(),
      rm: jest.fn()
    },
    id: jest.fn().mockResolvedValue({ id: 'test-id' }),
    repo: {
      stat: jest.fn().mockResolvedValue({ numObjects: 0, repoSize: 0, storageMax: 0 })
    }
  }))
}), { virtual: true });
jest.mock('redis', () => {
  const store = new Map();
  const lists = new Map();
  const hashes = new Map();

  const mockMulti = (client) => ({
    incr: jest.fn(function(key) {
      this._key = key;
      return this;
    }),
    incrBy: jest.fn(function(key, val) {
      this._key = key;
      this._val = val;
      return this;
    }),
    expire: jest.fn(function() {
      return this;
    }),
    lPush: jest.fn(function(key, val) {
      this._key = key;
      this._val = val;
      return this;
    }),
    zAdd: jest.fn(function() {
      return this;
    }),
    zRem: jest.fn(function() {
      return this;
    }),
    exec: jest.fn(async function() {
      const key = this._key;
      if (key) {
        const increment = this._val !== undefined ? this._val : 1;
        const current = parseInt(store.get(key) || '0') + increment;
        store.set(key, current.toString());
        return [current, 1];
      }
      return [1, 1];
    })
  });

  const mockClient = {
    on: jest.fn(),
    connect: jest.fn().mockResolvedValue(true),
    disconnect: jest.fn().mockResolvedValue(true),
    ping: jest.fn().mockResolvedValue('PONG'),
    get: jest.fn(async (key) => store.get(key) || null),
    set: jest.fn(async (key, val) => { store.set(key, val); return 'OK'; }),
    setEx: jest.fn(async (key, ttl, val) => { store.set(key, val); return 'OK'; }),
    del: jest.fn(async (keys) => {
      const keysArray = Array.isArray(keys) ? keys : [keys];
      keysArray.forEach(k => {
        store.delete(k);
        lists.delete(k);
        hashes.delete(k);
      });
      return keysArray.length;
    }),
    incrBy: jest.fn(async (key, val) => {
      const current = parseInt(store.get(key) || '0');
      const newVal = current + val;
      store.set(key, newVal.toString());
      return newVal;
    }),
    incr: jest.fn(async (key) => {
      const current = parseInt(store.get(key) || '0') + 1;
      store.set(key, current.toString());
      return current;
    }),
    expire: jest.fn().mockResolvedValue(1),
    lPush: jest.fn(async (key, val) => {
      if (!lists.has(key)) lists.set(key, []);
      lists.get(key).unshift(val);
      return lists.get(key).length;
    }),
    lTrim: jest.fn(async (key, start, stop) => {
      if (lists.has(key)) {
        const list = lists.get(key);
        // Correctly handle negative indices if needed, but simple slice for now
        lists.set(key, list.slice(start, stop === -1 ? undefined : stop + 1));
      }
      return 'OK';
    }),
    lRange: jest.fn(async (key, start, stop) => {
      if (!lists.has(key)) return [];
      const list = lists.get(key);
      return list.slice(start, stop === -1 ? undefined : stop + 1);
    }),
    hSet: jest.fn(async (key, field, val) => {
      if (!hashes.has(key)) hashes.set(key, new Map());
      hashes.get(key).set(field, val);
      return 1;
    }),
    hGet: jest.fn(async (key, field) => {
      if (!hashes.has(key)) return null;
      return hashes.get(key).get(field) || null;
    }),
    hGetAll: jest.fn(async (key) => {
      if (!hashes.has(key)) return {};
      return Object.fromEntries(hashes.get(key));
    }),
    lLen: jest.fn(async (key) => (lists.get(key) || []).length),
    zCard: jest.fn(async (key) => 0),
    zAdd: jest.fn().mockResolvedValue(1),
    zRem: jest.fn().mockResolvedValue(1),
    zRangeByScore: jest.fn().mockResolvedValue([]),
    brPop: jest.fn().mockResolvedValue(null),
    quit: jest.fn().mockResolvedValue(true),
    subscribe: jest.fn().mockResolvedValue(),
    unsubscribe: jest.fn().mockResolvedValue(),
    publish: jest.fn().mockResolvedValue(1),
    keys: jest.fn(async (pattern) => {
      const regex = new RegExp('^' + pattern.replace(/\*/g, '.*') + '$');
      return Array.from(store.keys()).filter(k => regex.test(k));
    }),
    multi: jest.fn(function() { return mockMulti(this); }),
    v4: {
      get: jest.fn(async (key) => store.get(key) || null),
      set: jest.fn(async (key, val) => { store.set(key, val); return 'OK'; }),
      del: jest.fn(async (key) => { store.delete(key); return 1; })
    }
  };

  return {
    createClient: jest.fn(() => mockClient)
  };
}, { virtual: true });

// Mock ioredis (used by secureCommController.ts at module load time)
jest.mock('ioredis', () => {
  const store = new Map();

  class MockRedis {
    constructor() {}
    async connect() { return true; }
    async disconnect() { return true; }
    async quit() { return true; }
    async ping() { return 'PONG'; }
    async get(key) { return store.get(key) || null; }
    async set(key, val) { store.set(key, val); return 'OK'; }
    async setex(key, ttl, val) { store.set(key, val); return 'OK'; }
    async del(...keys) {
      const flat = keys.flat();
      flat.forEach((k) => store.delete(k));
      return flat.length;
    }
    async keys(pattern) {
      const regex = new RegExp('^' + pattern.replace(/\*/g, '.*') + '$');
      return Array.from(store.keys()).filter((k) => regex.test(k));
    }
    async incr(key) {
      const v = (parseInt(store.get(key) || '0') + 1).toString();
      store.set(key, v);
      return parseInt(v);
    }
    async expire() { return 1; }
    on() { return this; }
  }

  return { Redis: MockRedis, default: MockRedis };
}, { virtual: true });

if (MongoMemoryServer) {
  let mongoServer = null;

  // Global test setup
  beforeAll(async () => {
    try {
      // Start in-memory MongoDB for testing
      mongoServer = await MongoMemoryServer.create();
      const mongoUri = mongoServer.getUri();

      await mongoose.connect(mongoUri);
    } catch (err) {
      console.warn('[setup:mongo] in-memory MongoDB failed to start; continuing without it:', err.message);
    }
  });

  // Global test teardown
  afterAll(async () => {
    try {
      await mongoose.disconnect();
    } catch (err) {
      console.warn('[setup:mongo] mongoose.disconnect failed:', err.message);
    }
    if (mongoServer) {
      try {
        await mongoServer.stop();
      } catch (err) {
        console.warn('[setup:mongo] mongoServer.stop failed:', err.message);
      }
    }
  });

  // Database cleanup between tests
  beforeEach(async () => {
    try {
      const collections = mongoose.connection.collections;
      for (const key in collections) {
        const collection = collections[key];
        await collection.deleteMany({});
      }
    } catch (err) {
      console.warn('[setup:mongo] beforeEach collection cleanup failed:', err.message);
    }
  });
} else {
  console.warn('[setup:mongo] mongodb-memory-server unavailable; skipping all mongo lifecycle hooks.');
}

// Global test utilities
global.testUtils = {
  // Create authenticated request
  authenticatedRequest: (token) => {
    // Lazy-load the Express app so we only pay the cost (and only risk
    // any pre-existing baseline bugs in the bootstrap chain) when a test
    // actually needs to issue an authenticated HTTP request.
    const app = require('../src/index');
    return request(app)
      .set('Authorization', `Bearer ${token}`);
  },
  
  // Generate test JWT token
  generateTestToken: (payload = {}) => {
    const jwt = require('jsonwebtoken');
    return jwt.sign(
      { 
        userId: 'test-user-id', 
        address: 'GD5DJ3B7MHLRWGS7QKXYYEJZRGFQMVJ7T7S6DLPNHP5TGB7FZ7NBHJVP',
        ...payload 
      },
      process.env.JWT_SECRET,
      { expiresIn: '1h' }
    );
  },
  
  // Generate test Stellar address
  generateStellarAddress: () => {
    return 'GD' + Math.random().toString(36).substring(2, 15) + 
           Math.random().toString(36).substring(2, 15).toUpperCase();
  },
  
  // Wait for async operations
  waitFor: (ms = 100) => new Promise(resolve => setTimeout(resolve, ms)),
  
  // Mock IPFS response
  mockIPFSResponse: (data) => ({
    cid: 'QmTest123456789',
    size: JSON.stringify(data).length,
    data: Buffer.from(JSON.stringify(data))
  }),
  
  // Mock Stellar transaction
  mockStellarTransaction: () => ({
    toXDR: () => 'mock-transaction-xdr',
    hash: () => 'mock-transaction-hash',
    sign: jest.fn(),
    submit: jest.fn().mockResolvedValue({ successful: true })
  })
};

// Mock console methods to reduce test noise
/*
global.console = {
  ...console,
  log: jest.fn(),
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn()
};
*/

// Error handling for unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});
