/**
 * Feature Flags Middleware Tests
 *
 * Verifies that the request-context middleware exposes evaluated flags on
 * `req.featureFlags` and fails open (empty flag set) when evaluation throws.
 */

jest.mock('../src/services/abTestingFramework', () => ({
  evaluateFlags: jest.fn().mockResolvedValue({}),
}));

const abTestingFramework = require('../src/services/abTestingFramework');
const {
  featureFlagsMiddleware,
  resolveUserId,
} = require('../src/middleware/featureFlags');

describe('resolveUserId', () => {
  it('prefers the authenticated user identifier', () => {
    expect(resolveUserId({ user: { userId: 'u-1' } })).toBe('u-1');
    expect(resolveUserId({ user: { _id: 'u-2' } })).toBe('u-2');
    expect(resolveUserId({ user: { sub: 'u-3' } })).toBe('u-3');
  });

  it('falls back to the X-User-Id header for anonymous callers', () => {
    expect(resolveUserId({ headers: { 'x-user-id': 'u-4' } })).toBe('u-4');
  });

  it('returns null when no user identifier is present', () => {
    expect(resolveUserId({})).toBeNull();
  });
});

describe('featureFlagsMiddleware', () => {
  beforeEach(() => {
    abTestingFramework.evaluateFlags.mockReset();
  });

  it('attaches evaluated flags to the request and calls next', async () => {
    abTestingFramework.evaluateFlags.mockResolvedValue({
      checkout_v2: true,
      new_dashboard: false,
    });

    const req = { user: { userId: 'u-1' } };
    const res = {};
    const next = jest.fn();

    await featureFlagsMiddleware(req, res, next);

    expect(abTestingFramework.evaluateFlags).toHaveBeenCalledWith('u-1');
    expect(req.featureFlags).toEqual({
      checkout_v2: true,
      new_dashboard: false,
    });
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('fails open with an empty flag set when evaluation throws', async () => {
    abTestingFramework.evaluateFlags.mockRejectedValue(new Error('boom'));

    const req = { user: { userId: 'u-1' } };
    const res = {};
    const next = jest.fn();

    await featureFlagsMiddleware(req, res, next);

    expect(req.featureFlags).toEqual({});
    expect(next).toHaveBeenCalledTimes(1);
  });
});
