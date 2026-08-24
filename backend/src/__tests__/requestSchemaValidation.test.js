const { validateRequestSchema } = require('../middleware/validateRequestSchema');
const {
  // Enrollment schemas
  createEnrollmentSchema,
  updateEnrollmentSchema,
  updateEnrollmentProgressSchema,
  completeEnrollmentSchema,
  cancelEnrollmentSchema,
  bulkEnrollmentSchema,
  validatePrerequisitesSchema,
  renewEnrollmentSchema,
  // Payment schemas
  createPaymentIntentSchema,
  createStellarPaymentSchema,
  submitStellarPaymentSchema,
  processRefundSchema,
  updatePaymentSettingsSchema,
  validatePaymentParametersSchema,
  convertCurrencySchema,
  stellarWebhookSchema,
  paymentGatewayWebhookSchema,
  // Moderation schemas
  moderateFlagSchema,
  batchModerateSchema,
  reportContentSchema,
  upsertAutoFlagRuleSchema,
  moderationQueueQuerySchema,
  // Webhook schemas
  registerWebhookSchema,
  updateWebhookSchema,
  getWebhookByIdSchema,
  getWebhookDeliveriesSchema,
  retryWebhookDeliverySchema,
} = require('../middleware/validation.ts');

const makeRes = () => {
  const res = { statusCode: 200 };
  res.status = jest.fn((code) => { res.statusCode = code; return res; });
  res.json = jest.fn((payload) => { res.bodySent = payload; return res; });
  return res;
};

const run = (schema, { body = {}, query = {}, params = {} } = {}) => {
  const middleware = validateRequestSchema(schema);
  const req = { body, query, params };
  const res = makeRes();
  const next = jest.fn();
  middleware(req, res, next);
  return { req, res, next };
};

const expectPass = (result) => {
  expect(result.next).toHaveBeenCalledTimes(1);
  expect(result.res.status).not.toHaveBeenCalled();
};

const expectFail = (result, expectedField) => {
  expect(result.next).not.toHaveBeenCalled();
  expect(result.res.status).toHaveBeenCalledWith(400);
  expect(result.res.bodySent.success).toBe(false);
  expect(result.res.bodySent.message).toBe('Validation failed');
  expect(Array.isArray(result.res.bodySent.errors)).toBe(true);
  if (expectedField) {
    expect(result.res.bodySent.errors.map((e) => e.field)).toContain(expectedField);
  }
};

describe('Enrollment request schemas', () => {
  describe('createEnrollmentSchema', () => {
    const valid = {
      courseId: 'course_123',
      paymentMethod: 'stellar',
      paymentDetails: { amount: 50, currency: 'USD', fromAddress: 'GABC...' },
    };

    it('accepts a valid enrollment payload', () => {
      expectPass(run(createEnrollmentSchema, { body: valid }));
    });

    it('rejects a payload missing courseId', () => {
      const { courseId, ...rest } = valid;
      expectFail(run(createEnrollmentSchema, { body: rest }), 'courseId');
    });

    it('rejects an unknown payment method without coercion', () => {
      expectFail(run(createEnrollmentSchema, {
        body: { ...valid, paymentMethod: 'cash' },
      }), 'paymentMethod');
    });

    it('rejects a nested paymentDetails without amount', () => {
      expectFail(run(createEnrollmentSchema, {
        body: { ...valid, paymentDetails: { currency: 'USD' } },
      }), 'paymentDetails.amount');
    });

    it('rejects a string amount instead of coercing it to a number', () => {
      expectFail(run(createEnrollmentSchema, {
        body: { ...valid, paymentDetails: { amount: '50' } },
      }), 'paymentDetails.amount');
    });

    it('strips unknown fields from the validated body', () => {
      const result = run(createEnrollmentSchema, {
        body: { ...valid, hackerField: 'x' },
      });
      expectPass(result);
      expect(result.req.body.hackerField).toBeUndefined();
    });
  });

  describe('updateEnrollmentSchema', () => {
    it('accepts a partial update with params id', () => {
      expectPass(run(updateEnrollmentSchema, {
        body: { progress: 40 },
        params: { id: 'enr_1' },
      }));
    });

    it('rejects an empty update body', () => {
      expectFail(run(updateEnrollmentSchema, { body: {}, params: { id: 'enr_1' } }));
    });

    it('rejects an out-of-range progress value', () => {
      expectFail(run(updateEnrollmentSchema, {
        body: { progress: 101 },
        params: { id: 'enr_1' },
      }), 'progress');
    });

    it('requires the id param', () => {
      expectFail(run(updateEnrollmentSchema, { body: { progress: 10 } }), 'id');
    });
  });

  describe('updateEnrollmentProgressSchema', () => {
    it('accepts a progress value of 100', () => {
      expectPass(run(updateEnrollmentProgressSchema, {
        body: { progress: 100 },
        params: { id: 'enr_1' },
      }));
    });

    it('rejects progress above 100', () => {
      expectFail(run(updateEnrollmentProgressSchema, {
        body: { progress: 150 },
        params: { id: 'enr_1' },
      }), 'progress');
    });

    it('rejects a non-numeric progress value', () => {
      expectFail(run(updateEnrollmentProgressSchema, {
        body: { progress: 'almost-done' },
        params: { id: 'enr_1' },
      }), 'progress');
    });
  });

  describe('completeEnrollmentSchema', () => {
    it('accepts an optional issueCertificate flag', () => {
      expectPass(run(completeEnrollmentSchema, {
        body: { issueCertificate: false },
        params: { id: 'enr_1' },
      }));
    });

    it('rejects a non-boolean issueCertificate', () => {
      expectFail(run(completeEnrollmentSchema, {
        body: { issueCertificate: 'yes' },
        params: { id: 'enr_1' },
      }), 'issueCertificate');
    });
  });

  describe('cancelEnrollmentSchema', () => {
    it('accepts an empty body with params id', () => {
      expectPass(run(cancelEnrollmentSchema, { body: {}, params: { id: 'enr_1' } }));
    });

    it('accepts an optional cancellation reason', () => {
      expectPass(run(cancelEnrollmentSchema, {
        body: { reason: 'Changed my mind' },
        params: { id: 'enr_1' },
      }));
    });

    it('requires the id param', () => {
      expectFail(run(cancelEnrollmentSchema, { body: {} }), 'id');
    });
  });

  describe('bulkEnrollmentSchema', () => {
    const valid = {
      operation: 'enroll',
      enrollments: [{ userId: 'u1', courseId: 'c1' }],
    };

    it('accepts a valid bulk operation', () => {
      expectPass(run(bulkEnrollmentSchema, { body: valid }));
    });

    it('rejects an unknown operation', () => {
      expectFail(run(bulkEnrollmentSchema, {
        body: { ...valid, operation: 'nuke' },
      }), 'operation');
    });

    it('rejects an empty enrollments array', () => {
      expectFail(run(bulkEnrollmentSchema, {
        body: { ...valid, enrollments: [] },
      }), 'enrollments');
    });
  });

  describe('validatePrerequisitesSchema', () => {
    it('accepts a courseId', () => {
      expectPass(run(validatePrerequisitesSchema, { body: { courseId: 'c1' } }));
    });

    it('rejects a missing courseId', () => {
      expectFail(run(validatePrerequisitesSchema, { body: {} }), 'courseId');
    });
  });

  describe('renewEnrollmentSchema', () => {
    it('accepts paymentDetails with params id', () => {
      expectPass(run(renewEnrollmentSchema, {
        body: { paymentDetails: { amount: 25, currency: 'USD' } },
        params: { id: 'enr_1' },
      }));
    });

    it('rejects missing paymentDetails', () => {
      expectFail(run(renewEnrollmentSchema, {
        body: {},
        params: { id: 'enr_1' },
      }), 'paymentDetails');
    });
  });
});

describe('Payment request schemas', () => {
  describe('createPaymentIntentSchema', () => {
    const valid = {
      enrollmentId: 'enr_1',
      method: 'credit_card',
      amount: 100,
      currency: 'USD',
    };

    it('accepts a valid payment intent', () => {
      expectPass(run(createPaymentIntentSchema, { body: valid }));
    });

    it('rejects a negative amount', () => {
      expectFail(run(createPaymentIntentSchema, {
        body: { ...valid, amount: -5 },
      }), 'amount');
    });

    it('rejects a 2-character currency', () => {
      expectFail(run(createPaymentIntentSchema, {
        body: { ...valid, currency: 'US' },
      }), 'currency');
    });

    it('rejects a missing method', () => {
      const { method, ...rest } = valid;
      expectFail(run(createPaymentIntentSchema, { body: rest }), 'method');
    });
  });

  describe('createStellarPaymentSchema', () => {
    const valid = {
      enrollmentId: 'enr_1',
      fromAddress: 'GABC...',
      amount: 10,
    };

    it('accepts a valid Stellar payment', () => {
      expectPass(run(createStellarPaymentSchema, { body: valid }));
    });

    it('rejects a missing fromAddress', () => {
      const { fromAddress, ...rest } = valid;
      expectFail(run(createStellarPaymentSchema, { body: rest }), 'fromAddress');
    });

    it('rejects an over-long asset code', () => {
      expectFail(run(createStellarPaymentSchema, {
        body: { ...valid, assetCode: 'ABCDEFGHIJKLM' },
      }), 'assetCode');
    });
  });

  describe('submitStellarPaymentSchema', () => {
    it('accepts a payment intent id and signed XDR', () => {
      expectPass(run(submitStellarPaymentSchema, {
        body: { paymentIntentId: 'pi_1', signedTransactionXDR: 'AAAA...' },
      }));
    });

    it('rejects a missing signedTransactionXDR', () => {
      expectFail(run(submitStellarPaymentSchema, {
        body: { paymentIntentId: 'pi_1' },
      }), 'signedTransactionXDR');
    });
  });

  describe('processRefundSchema', () => {
    it('accepts amount and reason with params id', () => {
      expectPass(run(processRefundSchema, {
        body: { amount: 50, reason: 'Duplicate charge' },
        params: { id: 'pay_1' },
      }));
    });

    it('rejects an empty refund body', () => {
      expectFail(run(processRefundSchema, {
        body: {},
        params: { id: 'pay_1' },
      }));
    });

    it('rejects a negative refund amount', () => {
      expectFail(run(processRefundSchema, {
        body: { amount: -10 },
        params: { id: 'pay_1' },
      }), 'amount');
    });
  });

  describe('updatePaymentSettingsSchema', () => {
    it('accepts a partial settings update', () => {
      expectPass(run(updatePaymentSettingsSchema, {
        body: { defaultCurrency: 'EUR' },
      }));
    });

    it('rejects an empty settings body', () => {
      expectFail(run(updatePaymentSettingsSchema, { body: {} }));
    });

    it('rejects an invalid stellar network', () => {
      expectFail(run(updatePaymentSettingsSchema, {
        body: { stellarSettings: { network: 'prod' } },
      }), 'stellarSettings.network');
    });
  });

  describe('validatePaymentParametersSchema', () => {
    it('accepts amount with optional fields', () => {
      expectPass(run(validatePaymentParametersSchema, { body: { amount: 20 } }));
    });

    it('rejects a missing amount', () => {
      expectFail(run(validatePaymentParametersSchema, { body: {} }), 'amount');
    });
  });

  describe('convertCurrencySchema', () => {
    it('accepts a valid conversion request', () => {
      expectPass(run(convertCurrencySchema, {
        body: { amount: 10, from: 'USD', to: 'EUR' },
      }));
    });

    it('rejects a missing target currency', () => {
      expectFail(run(convertCurrencySchema, {
        body: { amount: 10, from: 'USD' },
      }), 'to');
    });

    it('rejects a zero amount', () => {
      expectFail(run(convertCurrencySchema, {
        body: { amount: 0, from: 'USD', to: 'EUR' },
      }), 'amount');
    });
  });

  describe('stellarWebhookSchema', () => {
    it('accepts a payment webhook', () => {
      expectPass(run(stellarWebhookSchema, {
        body: { type: 'payment', transaction: { id: 'tx_1' } },
      }));
    });

    it('rejects an unknown webhook type', () => {
      expectFail(run(stellarWebhookSchema, {
        body: { type: 'hack', transaction: {} },
      }), 'type');
    });

    it('rejects a missing transaction object', () => {
      expectFail(run(stellarWebhookSchema, {
        body: { type: 'refund' },
      }), 'transaction');
    });
  });

  describe('paymentGatewayWebhookSchema', () => {
    it('accepts a stripe webhook', () => {
      expectPass(run(paymentGatewayWebhookSchema, {
        body: { gateway: 'stripe', event: 'charge.succeeded', data: {} },
      }));
    });

    it('rejects an unknown gateway', () => {
      expectFail(run(paymentGatewayWebhookSchema, {
        body: { gateway: 'square', event: 'x', data: {} },
      }), 'gateway');
    });
  });
});

describe('Moderation request schemas', () => {
  describe('moderateFlagSchema', () => {
    it('accepts a valid moderation action', () => {
      expectPass(run(moderateFlagSchema, {
        body: { action: 'approve', reason: 'Looks fine' },
        params: { id: 'flag_1' },
      }));
    });

    it('rejects an invalid moderation action', () => {
      expectFail(run(moderateFlagSchema, {
        body: { action: 'delete' },
        params: { id: 'flag_1' },
      }), 'action');
    });

    it('requires the flag id param', () => {
      expectFail(run(moderateFlagSchema, { body: { action: 'approve' } }), 'id');
    });
  });

  describe('batchModerateSchema', () => {
    it('accepts a valid batch request', () => {
      expectPass(run(batchModerateSchema, {
        body: { action: 'reject', flagIds: ['flag_1', 'flag_2'] },
      }));
    });

    it('rejects an empty flagIds array', () => {
      expectFail(run(batchModerateSchema, {
        body: { action: 'reject', flagIds: [] },
      }), 'flagIds');
    });
  });

  describe('reportContentSchema', () => {
    it('accepts a valid content report', () => {
      expectPass(run(reportContentSchema, {
        body: {
          contentType: 'discussion_post',
          contentId: 'post_1',
          reason: 'Spam',
        },
      }));
    });

    it('rejects a missing reason', () => {
      expectFail(run(reportContentSchema, {
        body: { contentType: 'review', contentId: 'rev_1' },
      }), 'reason');
    });

    it('rejects an unknown contentType', () => {
      expectFail(run(reportContentSchema, {
        body: { contentType: 'spam', contentId: 'x', reason: 'y' },
      }), 'contentType');
    });
  });

  describe('upsertAutoFlagRuleSchema', () => {
    it('accepts a valid rule', () => {
      expectPass(run(upsertAutoFlagRuleSchema, {
        body: {
          contentType: 'user_resource',
          keyword: 'offensive',
          severity: 'high',
          enabled: true,
        },
      }));
    });

    it('rejects a missing severity', () => {
      expectFail(run(upsertAutoFlagRuleSchema, {
        body: { contentType: 'review', keyword: 'x', enabled: true },
      }), 'severity');
    });

    it('rejects a non-boolean enabled flag', () => {
      expectFail(run(upsertAutoFlagRuleSchema, {
        body: {
          contentType: 'review',
          keyword: 'x',
          severity: 'low',
          enabled: 'yes',
        },
      }), 'enabled');
    });
  });

  describe('moderationQueueQuerySchema', () => {
    it('accepts valid query parameters', () => {
      expectPass(run(moderationQueueQuerySchema, {
        query: { page: 2, limit: 50, sortOrder: 'asc', status: 'pending' },
      }));
    });

    it('rejects a non-integer page', () => {
      expectFail(run(moderationQueueQuerySchema, {
        query: { page: 'two' },
      }), 'page');
    });

    it('rejects an invalid sort order', () => {
      expectFail(run(moderationQueueQuerySchema, {
        query: { sortOrder: 'up' },
      }), 'sortOrder');
    });
  });
});

describe('Webhook request schemas', () => {
  describe('registerWebhookSchema', () => {
    const valid = {
      url: 'https://example.com/hook',
      events: ['course.created', 'payment.received'],
    };

    it('accepts a valid webhook registration', () => {
      expectPass(run(registerWebhookSchema, { body: valid }));
    });

    it('rejects a missing url', () => {
      const { url, ...rest } = valid;
      expectFail(run(registerWebhookSchema, { body: rest }), 'url');
    });

    it('rejects a non-URL url', () => {
      expectFail(run(registerWebhookSchema, {
        body: { ...valid, url: 'not-a-url' },
      }), 'url');
    });

    it('rejects an unknown event type', () => {
      expectFail(run(registerWebhookSchema, {
        body: { ...valid, events: ['spam.happened'] },
      }), 'events.0');
    });

    it('rejects an empty events array', () => {
      expectFail(run(registerWebhookSchema, {
        body: { ...valid, events: [] },
      }), 'events');
    });
  });

  describe('updateWebhookSchema', () => {
    it('accepts a partial update with params id', () => {
      expectPass(run(updateWebhookSchema, {
        body: { isActive: false },
        params: { id: 'wh_1' },
      }));
    });

    it('rejects an empty update body', () => {
      expectFail(run(updateWebhookSchema, {
        body: {},
        params: { id: 'wh_1' },
      }));
    });

    it('rejects a non-boolean isActive', () => {
      expectFail(run(updateWebhookSchema, {
        body: { isActive: 'yes' },
        params: { id: 'wh_1' },
      }), 'isActive');
    });

    it('requires the id param', () => {
      expectFail(run(updateWebhookSchema, { body: { isActive: true } }), 'id');
    });
  });

  describe('getWebhookByIdSchema', () => {
    it('accepts an id param', () => {
      expectPass(run(getWebhookByIdSchema, { params: { id: 'wh_1' } }));
    });

    it('rejects a missing id param', () => {
      expectFail(run(getWebhookByIdSchema, { params: {} }), 'id');
    });
  });

  describe('getWebhookDeliveriesSchema', () => {
    it('accepts id param with pagination query', () => {
      expectPass(run(getWebhookDeliveriesSchema, {
        params: { id: 'wh_1' },
        query: { limit: 20, offset: 5 },
      }));
    });

    it('rejects a non-integer limit', () => {
      expectFail(run(getWebhookDeliveriesSchema, {
        params: { id: 'wh_1' },
        query: { limit: 'many' },
      }), 'limit');
    });
  });

  describe('retryWebhookDeliverySchema', () => {
    it('accepts id and deliveryId params', () => {
      expectPass(run(retryWebhookDeliverySchema, {
        params: { id: 'wh_1', deliveryId: 'del_1' },
      }));
    });

    it('rejects a missing deliveryId param', () => {
      expectFail(run(retryWebhookDeliverySchema, {
        params: { id: 'wh_1' },
      }), 'deliveryId');
    });
  });
});

describe('Field-level error detail', () => {
  it('reports nested field paths with dot notation', () => {
    const result = run(createEnrollmentSchema, {
      body: {
        courseId: 'c1',
        paymentMethod: 'stellar',
        paymentDetails: { currency: 123 },
      },
    });
    expectFail(result, 'paymentDetails.currency');
    expect(result.res.bodySent.errors[0]).toHaveProperty('source', 'body');
    expect(result.res.bodySent.errors[0].message).toEqual(expect.any(String));
  });

  it('aggregates multiple field errors in one response', () => {
    const result = run(createEnrollmentSchema, {
      body: { paymentDetails: { amount: 'oops' } },
    });
    expectFail(result, 'courseId');
    const fields = result.res.bodySent.errors.map((e) => e.field);
    expect(fields).toContain('paymentMethod');
    expect(fields).toContain('paymentDetails.amount');
  });
});
