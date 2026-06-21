import request from 'supertest';
import express from 'express';
import { PaymentController } from '../../src/controllers/PaymentController';
import { PaymentService } from '../../src/services/PaymentService';
import { StellarPaymentService } from '../../src/services/StellarPaymentService';
import { NotificationService } from '../../src/services/notificationService';

// Mock implementations
const mockPaymentService = {
  createPaymentIntent: jest.fn().mockResolvedValue({ id: 'intent123', status: 'pending' }),
  createStellarPaymentIntent: jest.fn().mockResolvedValue({ paymentIntentId: 'intent123', transactionXDR: 'mockXDR' }),
  processStellarPayment: jest.fn().mockResolvedValue({ userId: 'user1', transactionHash: 'hash123' }),
  getPaymentById: jest.fn().mockResolvedValue({ id: 'payment1', userId: 'user1' }),
  // other methods can be added as needed
};

const mockStellarService = {
  // Provide minimal interface used in controller
  validatePaymentParameters: jest.fn().mockReturnValue({ isValid: true, errors: [], warnings: [] }),
  // The real methods are not called because we mock PaymentService above
} as unknown as StellarPaymentService;

const mockNotificationService = {
  sendPaymentConfirmationNotification: jest.fn().mockResolvedValue(undefined),
} as unknown as NotificationService;

// Setup Express app for integration testing
const app = express();
app.use(express.json());
const controller = new PaymentController(
  mockStellarService,
  mockPaymentService as unknown as PaymentService,
  mockNotificationService as unknown as NotificationService
);
app.post('/intent', (req, res) => controller.createPaymentIntent(req, res));
app.post('/stellar/create', (req, res) => controller.createStellarPayment(req, res));
app.post('/stellar/submit', (req, res) => controller.submitStellarPayment(req, res));

describe('Payment integration flow', () => {
  test('Successful payment intent, stellar creation and submission', async () => {
    // Create intent
    const intentRes = await request(app)
      .post('/intent')
      .send({ enrollmentId: 'enroll1', method: 'stellar', amount: '10', currency: 'USD' })
      .expect(201);
    expect(intentRes.body.success).toBe(true);
    expect(mockPaymentService.createPaymentIntent).toHaveBeenCalled();

    // Create stellar payment
    const stellarRes = await request(app)
      .post('/stellar/create')
      .send({ enrollmentId: 'enroll1', fromAddress: 'GAAAA...', amount: '10', assetCode: 'XLM' })
      .expect(201);
    expect(stellarRes.body.success).toBe(true);
    expect(mockPaymentService.createStellarPaymentIntent).toHaveBeenCalled();

    // Submit stellar payment
    const submitRes = await request(app)
      .post('/stellar/submit')
      .send({ paymentIntentId: 'intent123', signedTransactionXDR: 'signedXDR' })
      .expect(200);
    expect(submitRes.body.success).toBe(true);
    expect(mockPaymentService.processStellarPayment).toHaveBeenCalled();
    expect(mockNotificationService.sendPaymentConfirmationNotification).toHaveBeenCalled();
  });

  test('Payment validation failure returns 400', async () => {
    // Force validation failure
    (mockStellarService.validatePaymentParameters as jest.Mock).mockReturnValueOnce({
      isValid: false,
      errors: ['Invalid amount'],
      warnings: []
    });
    const res = await request(app)
      .post('/stellar/create')
      .send({ enrollmentId: 'enroll1', fromAddress: 'invalid', amount: '-5', assetCode: 'XLM' })
      .expect(400);
    expect(res.body.success).toBe(false);
    expect(res.body.errors).toContain('Invalid amount');
  });
});
