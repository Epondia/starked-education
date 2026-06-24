import request from 'supertest';
import express from 'express';
import { PaymentController } from '../../src/controllers/PaymentController';
import { StellarPaymentService } from '../../src/services/StellarPaymentService';
import { PaymentService } from '../../src/services/PaymentService';
import { NotificationService } from '../../src/services/notificationService';
import { Horizon } from '@stellar/stellar-sdk';
import { Server as HorizonServer } from '@stellar/stellar-sdk';
import { jest } from '@jest/globals';

/**
 * Mock Horizon server for Stellar interactions.
 */
class MockHorizonServer {
  async loadAccount(_: string) {
    return { balances: [{ asset_type: 'native', balance: '1000' }] } as any;
  }
  async submitTransaction(_: any) {
    return { successful: true, resultXdr: 'mock', hash: 'HASH123' } as any;
  }
  async transactions() {
    return { transaction: (_: string) => ({ call: async () => ({ successful: true, operations: [{ type: 'payment', destination: 'DISTRIBUTION', amount: '10', asset_type: 'native' }] }) }) } as any;
  }
  async ledgers() {
    return { limit: (_: number) => ({ order: (_: string) => ({ call: async () => ({ records: [{ sequence: '100' }] }) }) }) } as any;
  }
  async fetchBaseFee() {
    return 100;
  }
}

// Helper to create app with injected services
function createApp({ paymentService, stellarService, notificationService }: any) {
  const app = express();
  app.use(express.json());
  const controller = new PaymentController();
  // Overwrite internal services for testability
  (controller as any).paymentService = paymentService;
  (controller as any).stellarPaymentService = stellarService;
  (controller as any).notificationService = notificationService;
  // Register routes (only the needed ones for this test)
  app.post('/api/payments/intent', (req, res) => controller.createPaymentIntent(req, res));
  app.post('/api/payments/stellar/create', (req, res) => controller.createStellarPayment(req, res));
  app.post('/api/payments/stellar/submit', (req, res) => controller.submitStellarPayment(req, res));
  return app;
}

describe('Payment integration flow', () => {
  let app: any;
  let mockStellar: any;
  let mockPaymentService: any;
  let mockNotificationService: any;

  beforeEach(() => {
    mockStellar = new StellarPaymentService({
      network: 'testnet',
      horizonUrl: 'http://mock-horizon',
      distributionAccount: 'DISTRIBUTION',
      acceptedAssets: [],
      autoConfirmPayments: true,
      confirmationThreshold: 1
    }, new MockHorizonServer() as unknown as HorizonServer);
    mockPaymentService = {
      async createPaymentIntent(enrollmentId: string, method: string, options: any) {
        return { id: 'intent123', enrollmentId, method, ...options };
      },
      async createStellarPaymentIntent(enrollmentId: string, opts: any) {
        return { id: 'stellarIntent', enrollmentId, ...opts };
      },
      async processStellarPayment(intentId: string, signedXDR: string) {
        return { userId: 'user1', amount: '10', assetCode: 'XLM', transactionHash: 'HASH123' } as any;
      }
    } as any;
    mockNotificationService = {
      async sendPaymentConfirmationNotification(_: any, __: any) { /* noop */ }
    } as any;

    app = createApp({ paymentService: mockPaymentService, stellarService: mockStellar, notificationService: mockNotificationService });
  });

  test('successful payment flow', async () => {
    // Step 1: create intent
    const intentRes = await request(app)
      .post('/api/payments/intent')
      .send({ enrollmentId: 'enroll1', method: 'stellar', amount: '10', currency: 'XLM', metadata: {} })
      .expect(201);
    expect(intentRes.body.success).toBe(true);
    const intentId = intentRes.body.data.id;

    // Step 2: create stellar transaction
    const stellarRes = await request(app)
      .post('/api/payments/stellar/create')
      .send({ enrollmentId: 'enroll1', fromAddress: 'GABC...', amount: '10', assetCode: 'XLM' })
      .expect(201);
    expect(stellarRes.body.success).toBe(true);
    const { transactionXDR } = stellarRes.body.data;

    // Step 3: submit transaction
    const submitRes = await request(app)
      .post('/api/payments/stellar/submit')
      .send({ paymentIntentId: intentId, signedTransactionXDR: transactionXDR })
      .expect(200);
    expect(submitRes.body.success).toBe(true);
    expect(submitRes.body.data.transaction.transactionHash).toBe('HASH123');
  });

  // Additional tests for failure, duplicate, concurrency can be added similarly.
});
