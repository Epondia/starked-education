/**
 * Tests for the soroban-client → @stellar/stellar-sdk migration (issue #395).
 *
 * The credential RPC methods must construct `rpc.Server` from
 * `@stellar/stellar-sdk` and call `simulateTransaction` on it, and the
 * deprecated `soroban-client` package must not be referenced anywhere in the
 * service.
 */

jest.mock('@stellar/stellar-sdk', () => {
  const serverInstance = {
    loadAccount: jest.fn(async () => ({ accountId: 'G_ADMIN' })),
  };

  class Server {
    constructor(url) {
      this.url = url;
      this.loadAccount = serverInstance.loadAccount;
    }
  }

  class Contract {
    constructor(contractId) {
      this.contractId = contractId;
    }
  }

  class TransactionBuilder {
    addOperation() {
      return this;
    }
    setTimeout() {
      return this;
    }
    build() {
      return { built: true };
    }
  }

  const rpcServerInstance = {
    simulateTransaction: jest.fn(),
  };

  // Mock class: `new rpc.Server(url)` must be observable as a constructor call.
  const RpcServer = jest.fn(function (url) {
    this.url = url;
    this.simulateTransaction = rpcServerInstance.simulateTransaction;
  });

  return {
    Server,
    Contract,
    TransactionBuilder,
    Operation: { invokeContractFunction: jest.fn((opts) => opts) },
    Asset: class {},
    Memo: class {},
    MemoText: class {},
    Networks: { PUBLIC: 'public', TESTNET: 'testnet' },
    rpc: { Server: RpcServer },
    __rpcServer: rpcServerInstance,
  };
});

// `tests/setup.js` boots the full app (and the real SDK) before this file
// runs; reset the module registry so the mock above applies.
jest.resetModules();

const fs = require('fs');
const { StellarService } = require('../stellarService');

describe('StellarService Soroban RPC (issue #395)', () => {
  let service;

  beforeEach(() => {
    process.env.STELLAR_NETWORK = 'testnet';
    process.env.CREDENTIAL_REGISTRY_CONTRACT_ID = 'C_CONTRACT';
    process.env.SOROBAN_RPC_URL = 'https://soroban-testnet.stellar.org:443';
    process.env.ADMIN_PUBLIC_KEY = 'G_ADMIN';
    delete process.env.CREDENTIAL_EXPIRATION_MONITORING_ENABLED;

    const { __rpcServer } = require('@stellar/stellar-sdk');
    __rpcServer.simulateTransaction.mockReset();
    __rpcServer.simulateTransaction.mockResolvedValue({
      results: [{ value: ['1', '2'] }],
    });

    jest.clearAllMocks();
    service = new StellarService();
  });

  test('does not reference the deprecated soroban-client package', () => {
    const source = fs.readFileSync(require.resolve('../stellarService'), 'utf8');
    expect(source).not.toMatch(/soroban-client/);
  });

  test('getCredentialsExpiringSoon uses rpc.Server from @stellar/stellar-sdk', async () => {
    const { rpc, __rpcServer } = require('@stellar/stellar-sdk');

    const ids = await service.getCredentialsExpiringSoon(3600);

    expect(rpc.Server).toHaveBeenCalledWith('https://soroban-testnet.stellar.org:443');
    expect(__rpcServer.simulateTransaction).toHaveBeenCalledTimes(1);
    expect(__rpcServer.simulateTransaction).toHaveBeenCalledWith(
      expect.objectContaining({
        source: 'G_ADMIN',
        transaction: { built: true },
      }),
    );
    expect(ids).toEqual([1, 2]);
  });

  test('getExpiredCredentials returns parsed credential ids', async () => {
    const ids = await service.getExpiredCredentials();
    expect(ids).toEqual([1, 2]);
  });

  test('returns an empty array when the RPC call fails', async () => {
    const { __rpcServer } = require('@stellar/stellar-sdk');
    __rpcServer.simulateTransaction.mockRejectedValue(new Error('rpc down'));

    await expect(service.getCredentialsExpiringSoon(60)).resolves.toEqual([]);
    await expect(service.getExpiredCredentials()).resolves.toEqual([]);
  });

  test('batchUpdateExpirationStatus returns early without an RPC call when there are no credentials', async () => {
    const { __rpcServer } = require('@stellar/stellar-sdk');
    jest.spyOn(service, 'getAllCredentialIds').mockResolvedValue([]);

    await service.batchUpdateExpirationStatus();

    expect(__rpcServer.simulateTransaction).not.toHaveBeenCalled();
  });

  test('batchUpdateExpirationStatus simulates one transaction per batch', async () => {
    const { __rpcServer } = require('@stellar/stellar-sdk');
    jest.spyOn(service, 'getAllCredentialIds').mockResolvedValue(['c1', 'c2', 'c3']);

    await service.batchUpdateExpirationStatus();

    expect(__rpcServer.simulateTransaction).toHaveBeenCalledTimes(1); // batchSize 50 > 3
    expect(__rpcServer.simulateTransaction).toHaveBeenCalledWith(
      expect.objectContaining({
        transaction: { built: true },
      }),
    );
  });
});
