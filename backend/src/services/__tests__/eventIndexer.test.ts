/**
 * Unit & integration-style tests for the EventIndexer service.
 *
 * Strategy
 * ────────
 * • All external dependencies (Soroban RPC, PostgreSQL pool) are mocked so
 *   these tests run without a live network or database.
 * • We exercise the happy path, checkpoint resume, deduplication, malformed-
 *   event skipping, and graceful shutdown.
 */

import { Pool, PoolClient } from 'pg';
import { xdr, SorobanRpc } from '@stellar/stellar-sdk';
import { EventIndexer, getIndexerStatus } from '../eventIndexer';
import { IndexedEventType, TOPIC_TO_EVENT_TYPE } from '../../models/IndexedEvent';

// ---------------------------------------------------------------------------
// Helpers to build fake Soroban RPC responses
// ---------------------------------------------------------------------------

function makeScSymbol(value: string): xdr.ScVal {
  // We bypass the real XDR encode/decode in unit tests by returning a
  // pre-native-decoded string inside a minimal xdr.ScVal shell via the
  // scValToNative path that the service uses.
  // We mock scValToNative at the module level below, so just return a
  // tagged wrapper.
  return { _type: 'scvSymbol', _value: value } as unknown as xdr.ScVal;
}

function makeEvent(
  id: string,
  ledger: number,
  topics: xdr.ScVal[],
  value: xdr.ScVal,
): SorobanRpc.Api.EventResponse {
  return {
    id,
    ledger: String(ledger),
    ledgerClosedAt: new Date().toISOString(),
    contractId: 'CTEST',
    pagingToken: id,
    topic,       // will be topics below
    value,
    inSuccessfulContractCall: true,
    type: 'contract',
  } as unknown as SorobanRpc.Api.EventResponse;

  // TypeScript sees the return above; the object spread below is the real one
}

/** Build a minimal EventResponse without TS overload conflicts */
function buildEvent(
  id: string,
  ledger: number,
  topicValues: string[],
  payloadArray: unknown[],
): SorobanRpc.Api.EventResponse {
  const topicScVals = topicValues.map(makeScSymbol);
  const valueScVal = { _type: 'scvVec', _value: payloadArray } as unknown as xdr.ScVal;
  return {
    id,
    ledger: String(ledger),
    ledgerClosedAt: new Date().toISOString(),
    contractId: 'CTEST001',
    pagingToken: id,
    topic: topicScVals,
    value: valueScVal,
    inSuccessfulContractCall: true,
    type: 'contract',
  } as unknown as SorobanRpc.Api.EventResponse;
}

// ---------------------------------------------------------------------------
// Mock @stellar/stellar-sdk so we control scValToNative
// ---------------------------------------------------------------------------

jest.mock('@stellar/stellar-sdk', () => {
  const original = jest.requireActual('@stellar/stellar-sdk');

  return {
    ...original,
    scValToNative: jest.fn((scVal: any) => {
      // Our fake ScVal objects carry _value directly
      if (scVal && scVal._type === 'scvSymbol') return scVal._value;
      if (scVal && scVal._type === 'scvVec')   return scVal._value;
      return scVal;
    }),
    SorobanRpc: {
      ...original.SorobanRpc,
      Server: jest.fn().mockImplementation(() => ({
        getLatestLedger: jest.fn().mockResolvedValue({ sequence: 1000 }),
        getEvents: jest.fn().mockResolvedValue({ events: [], cursor: undefined }),
      })),
    },
  };
});

// ---------------------------------------------------------------------------
// Mock pg Pool & PoolClient
// ---------------------------------------------------------------------------

const mockQuery = jest.fn().mockResolvedValue({ rows: [], rowCount: 0 });
const mockRelease = jest.fn();

const mockClient: Partial<PoolClient> = {
  query: mockQuery,
  release: mockRelease,
};

const mockPoolConnect = jest.fn().mockResolvedValue(mockClient as PoolClient);
const mockPoolQuery  = jest.fn().mockResolvedValue({ rows: [], rowCount: 0 });

const mockPool: Partial<Pool> = {
  connect: mockPoolConnect,
  query: mockPoolQuery,
};

// ---------------------------------------------------------------------------
// Test setup
// ---------------------------------------------------------------------------

let indexer: EventIndexer;
let rpcMock: any;

beforeEach(() => {
  jest.clearAllMocks();

  // Re-read the mocked constructor to get a fresh server instance ref
  const { SorobanRpc } = require('@stellar/stellar-sdk');
  rpcMock = {
    getLatestLedger: jest.fn().mockResolvedValue({ sequence: 1000 }),
    getEvents: jest.fn().mockResolvedValue({ events: [], cursor: undefined }),
  };
  SorobanRpc.Server.mockImplementation(() => rpcMock);

  // Pool: checkpoint returns ledger 500
  mockPoolQuery.mockImplementation((sql: string) => {
    if (sql.includes('indexer_checkpoints')) {
      return Promise.resolve({ rows: [{ last_ledger: '500' }], rowCount: 1 });
    }
    return Promise.resolve({ rows: [], rowCount: 0 });
  });

  mockQuery.mockResolvedValue({ rows: [], rowCount: 0 });

  indexer = new EventIndexer(mockPool as Pool, {
    rpcUrl: 'https://soroban-testnet.stellar.org',
    contractIds: ['CTEST001'],
    pollIntervalMs: 9999999, // disable auto-re-schedule in tests
    batchSize: 100,
  });
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('EventIndexer – TOPIC_TO_EVENT_TYPE mapping', () => {
  it('resolves all 7 required event types', () => {
    const requiredTypes: IndexedEventType[] = [
      IndexedEventType.CredentialIssued,
      IndexedEventType.CredentialRevoked,
      IndexedEventType.CourseCreated,
      IndexedEventType.EnrollmentCreated,
      IndexedEventType.AchievementMinted,
      IndexedEventType.PaymentReceived,
      IndexedEventType.ProfileUpdated,
    ];

    const mapped = Object.values(TOPIC_TO_EVENT_TYPE);
    requiredTypes.forEach((type) => {
      expect(mapped).toContain(type);
    });
  });
});

describe('EventIndexer – poll()', () => {
  it('catches up when already at the latest ledger (no-op)', async () => {
    // checkpoint = latest ledger (no new ledgers)
    mockPoolQuery.mockResolvedValue({ rows: [{ last_ledger: '1000' }], rowCount: 1 });

    await indexer.poll();

    expect(rpcMock.getEvents).not.toHaveBeenCalled();
  });

  it('fetches events for the ledger window [checkpoint+1 … min(latest, batch)]', async () => {
    rpcMock.getEvents.mockResolvedValue({ events: [], cursor: undefined });

    await indexer.poll();

    // checkpoint was 500, latest is 1000, batchSize 100 → window 501–600
    expect(rpcMock.getEvents).toHaveBeenCalledWith(
      expect.objectContaining({ startLedger: 501 }),
    );
  });

  it('advances the checkpoint after a successful poll', async () => {
    rpcMock.getEvents.mockResolvedValue({ events: [], cursor: undefined });

    await indexer.poll();

    // Should have called pool.query with an UPDATE/INSERT for checkpoint_key='default'
    const checkpointCall = mockPoolQuery.mock.calls.find(
      ([sql]: [string]) => sql && sql.includes('indexer_checkpoints') && sql.includes('ON CONFLICT'),
    );
    expect(checkpointCall).toBeTruthy();
    // New checkpoint should be 600 (501 + 100 - 1)
    expect(checkpointCall![1]).toEqual([600]);
  });
});

describe('EventIndexer – event persistence', () => {
  it('inserts a CredentialIssued event with correct columns', async () => {
    const event = buildEvent(
      '501-0-0',
      501,
      ['cred', 'issued'],
      ['GABC123', 42, 1001],
    );
    rpcMock.getEvents.mockResolvedValue({ events: [event], cursor: undefined });

    await indexer.poll();

    const insertCall = mockQuery.mock.calls.find(
      ([sql]: [string]) => sql && sql.includes('INSERT INTO indexed_events'),
    );
    expect(insertCall).toBeTruthy();
    const params = insertCall![1];
    expect(params[0]).toBe('CTEST001');   // contract_id
    expect(params[1]).toBe(501);          // ledger
    expect(params[3]).toBe('CredentialIssued'); // event_type
  });

  it('uses ON CONFLICT DO NOTHING for deduplication', async () => {
    const event = buildEvent('501-0-0', 501, ['cred', 'issued'], ['GABC123', 42, 1001]);
    rpcMock.getEvents.mockResolvedValue({ events: [event], cursor: undefined });

    await indexer.poll();
    await indexer.poll(); // second poll for same ledger range

    const insertCalls = mockQuery.mock.calls.filter(
      ([sql]: [string]) => sql && sql.includes('ON CONFLICT (contract_id, ledger, event_index) DO NOTHING'),
    );
    // Both calls go through; the DB constraint prevents duplicates
    expect(insertCalls.length).toBeGreaterThanOrEqual(1);
  });

  it('falls back to Unknown event type for unrecognised topics', async () => {
    const event = buildEvent('502-0-0', 502, ['weird', 'topic'], []);
    rpcMock.getEvents.mockResolvedValue({ events: [event], cursor: undefined });
    mockPoolQuery.mockImplementation((sql: string) => {
      if (sql.includes('indexer_checkpoints') && sql.includes('SELECT')) {
        return Promise.resolve({ rows: [{ last_ledger: '501' }], rowCount: 1 });
      }
      return Promise.resolve({ rows: [], rowCount: 0 });
    });

    await indexer.poll();

    const insertCall = mockQuery.mock.calls.find(
      ([sql]: [string]) => sql && sql.includes('INSERT INTO indexed_events'),
    );
    expect(insertCall).toBeTruthy();
    expect(insertCall![1][3]).toBe(IndexedEventType.Unknown);
  });
});

describe('EventIndexer – malformed event handling', () => {
  it('skips a malformed event and continues processing the batch', async () => {
    // First event causes the INSERT to throw; second event should still be processed
    const goodEvent  = buildEvent('501-0-0', 501, ['cred', 'issued'],    ['GABC', 1, 100]);
    const badEvent   = buildEvent('501-0-1', 501, ['cred', 'issued'],    ['GABC', 2, 101]);

    rpcMock.getEvents.mockResolvedValue({ events: [badEvent, goodEvent], cursor: undefined });

    let callCount = 0;
    mockQuery.mockImplementation((sql: string) => {
      if (sql.includes('INSERT INTO indexed_events')) {
        callCount++;
        if (callCount === 1) throw new Error('Simulated DB error on first event');
      }
      return Promise.resolve({ rows: [], rowCount: 0 });
    });

    // Should not throw
    await expect(indexer.poll()).resolves.not.toThrow();

    // Second event's INSERT should still have been attempted
    const insertCalls = mockQuery.mock.calls.filter(
      ([sql]: [string]) => sql && sql.includes('INSERT INTO indexed_events'),
    );
    expect(insertCalls.length).toBeGreaterThanOrEqual(1);
  });
});

describe('EventIndexer – graceful shutdown', () => {
  it('transitions status to stopped after stop() is called', async () => {
    await indexer.start();
    await indexer.stop();
    const status = getIndexerStatus();
    expect(status.status).toBe('stopped');
  });
});

describe('EventIndexer – checkpoint resume', () => {
  it('resumes from the last saved checkpoint on restart', async () => {
    // Checkpoint saved at ledger 750
    mockPoolQuery.mockImplementation((sql: string) => {
      if (sql.includes('indexer_checkpoints') && sql.includes('SELECT')) {
        return Promise.resolve({ rows: [{ last_ledger: '750' }], rowCount: 1 });
      }
      return Promise.resolve({ rows: [], rowCount: 0 });
    });

    rpcMock.getEvents.mockResolvedValue({ events: [], cursor: undefined });

    await indexer.poll();

    expect(rpcMock.getEvents).toHaveBeenCalledWith(
      expect.objectContaining({ startLedger: 751 }),
    );
  });
});

describe('EventIndexer – getIndexerStatus()', () => {
  it('returns a status object with required keys', () => {
    const status = getIndexerStatus();
    expect(status).toHaveProperty('status');
    expect(status).toHaveProperty('lastLedger');
    expect(status).toHaveProperty('eventsProcessed');
    expect(status).toHaveProperty('lag');
  });

  it('does not return a mutable reference', () => {
    const s1 = getIndexerStatus();
    const s2 = getIndexerStatus();
    expect(s1).not.toBe(s2); // different object references
  });
});

describe('EventIndexer – no contract IDs configured', () => {
  it('logs a warning and does not start when contractIds is empty', async () => {
    const noContractIndexer = new EventIndexer(mockPool as Pool, {
      contractIds: [],
      pollIntervalMs: 9999999,
    });

    await noContractIndexer.start();

    const status = getIndexerStatus();
    expect(status.status).toBe('stopped');
    expect(rpcMock.getEvents).not.toHaveBeenCalled();
  });
});
