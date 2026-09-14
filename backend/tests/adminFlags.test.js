/**
 * Admin Feature Flag / Experiment Routes Tests
 *
 * Exercises the new admin endpoints end-to-end via supertest with the
 * framework, auth, and validation layers mocked so the routes are tested
 * in isolation (the same approach as adminJobs.test.js).
 */

const express = require('express');
const request = require('supertest');

jest.mock('../src/middleware/auth', () => ({
  authenticateToken: (req, res, next) => next(),
  requireAdmin: (req, res, next) => next(),
  requirePermission: () => (req, res, next) => next(),
}));

jest.mock('../src/middleware/validateRequestSchema', () => ({
  validateRequestSchema: () => (req, res, next) => next(),
}));

jest.mock('../src/utils/roles', () => ({
  PERMISSIONS: { SYSTEM_MANAGE: 'system:manage' },
  UserRole: {},
}));

jest.mock('../src/services/analyticsService', () => ({
  AnalyticsService: {},
}));

jest.mock('../src/middleware/rateLimiter', () => ({
  adminTierLimiter: (req, res, next) => next(),
}));

jest.mock('../src/utils/database', () => ({
  getPoolHealthReport: () => ({}),
}));

jest.mock('../src/services/abTestingFramework', () => ({
  createFlag: jest.fn(),
  listFlags: jest.fn(),
  getFlag: jest.fn(),
  updateFlag: jest.fn(),
  deleteFlag: jest.fn(),
  createExperiment: jest.fn(),
  listExperiments: jest.fn(),
  startExperiment: jest.fn(),
  stopExperiment: jest.fn(),
  deleteExperiment: jest.fn(),
}));

const abTestingFramework = require('../src/services/abTestingFramework');
const adminRouter = require('../src/routes/admin');

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/v1/admin', adminRouter);
  return app;
}

describe('Admin feature flag & experiment routes', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('creates a feature flag', async () => {
    abTestingFramework.createFlag.mockResolvedValue({
      name: 'checkout_v2',
      enabled: false,
    });

    const res = await request(buildApp())
      .post('/api/v1/admin/flags')
      .send({ name: 'checkout_v2', enabled: false });

    expect(res.status).toBe(201);
    expect(res.body.flag.name).toBe('checkout_v2');
    expect(abTestingFramework.createFlag).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'checkout_v2' })
    );
  });

  it('toggles a feature flag without redeploy', async () => {
    abTestingFramework.updateFlag.mockResolvedValue({
      name: 'checkout_v2',
      enabled: true,
    });

    const res = await request(buildApp())
      .put('/api/v1/admin/flags/checkout_v2')
      .send({ enabled: true });

    expect(res.status).toBe(200);
    expect(res.body.flag.enabled).toBe(true);
    expect(abTestingFramework.updateFlag).toHaveBeenCalledWith(
      'checkout_v2',
      expect.objectContaining({ enabled: true })
    );
  });

  it('returns 404 for an unknown flag', async () => {
    abTestingFramework.getFlag.mockResolvedValue(null);

    const res = await request(buildApp()).get('/api/v1/admin/flags/nope');

    expect(res.status).toBe(404);
  });

  it('creates an A/B experiment', async () => {
    abTestingFramework.createExperiment.mockResolvedValue({
      id: 'exp-1',
      name: 'search_ranking',
      variants: [{ name: 'control' }, { name: 'treatment' }],
    });

    const res = await request(buildApp())
      .post('/api/v1/admin/experiments')
      .send({
        name: 'search_ranking',
        variants: [{ name: 'control' }, { name: 'treatment' }],
      });

    expect(res.status).toBe(201);
    expect(res.body.experiment.name).toBe('search_ranking');
    expect(abTestingFramework.createExperiment).toHaveBeenCalled();
  });

  it('starts and stops an A/B experiment', async () => {
    abTestingFramework.startExperiment.mockResolvedValue({ status: 'active' });
    abTestingFramework.stopExperiment.mockResolvedValue({ status: 'completed' });

    const startRes = await request(buildApp()).post(
      '/api/v1/admin/experiments/search_ranking/start'
    );
    expect(startRes.status).toBe(200);
    expect(abTestingFramework.startExperiment).toHaveBeenCalledWith('search_ranking');

    const stopRes = await request(buildApp()).post(
      '/api/v1/admin/experiments/search_ranking/stop'
    );
    expect(stopRes.status).toBe(200);
    expect(abTestingFramework.stopExperiment).toHaveBeenCalledWith('search_ranking');
  });
});
