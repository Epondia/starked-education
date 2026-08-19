/**
 * A/B Testing Framework Tests — feature flags & stable cohorts
 *
 * Covers the server-side feature flag surface required by issue #333:
 *   - flag evaluation per user with override support
 *   - safe fallback for missing/unknown flags
 *   - toggling/overrides without redeploy
 *   - deterministic percentage rollouts
 *   - stable cohort assignment for A/B experiments
 */

// Force the framework into its in-memory storage mode (no Redis in unit tests).
jest.mock('redis', () => ({
  createClient: () => {
    throw new Error('redis unavailable in unit tests');
  },
}));

const { ABTestingFramework } = require('../src/services/abTestingFramework');

function createFramework() {
  return new ABTestingFramework();
}

describe('ABTestingFramework — feature flags', () => {
  it('evaluates an enabled global flag as true', async () => {
    const ab = createFramework();
    await ab.createFlag({ name: 'new_dashboard', enabled: true });

    expect(await ab.isFlagEnabled('new_dashboard', 'user-1')).toBe(true);
  });

  it('falls back safely for missing/unknown flags', async () => {
    const ab = createFramework();

    expect(await ab.isFlagEnabled('does_not_exist', 'user-1')).toBe(false);
    expect(await ab.evaluateFlags('user-1')).toEqual({});
  });

  it('applies per-user overrides ahead of the master switch', async () => {
    const ab = createFramework();
    await ab.createFlag({
      name: 'beta_feature',
      enabled: false,
      userOverrides: { 'force-on': true, 'force-off': false },
    });

    // Global switch is off, but the override can force it on.
    expect(await ab.isFlagEnabled('beta_feature', 'force-on')).toBe(true);
    expect(await ab.isFlagEnabled('beta_feature', 'regular-user')).toBe(false);

    // Turning the global switch on does not override an explicit opt-out.
    await ab.updateFlag('beta_feature', { enabled: true });
    expect(await ab.isFlagEnabled('beta_feature', 'force-off')).toBe(false);
    expect(await ab.isFlagEnabled('beta_feature', 'regular-user')).toBe(true);
  });

  it('supports toggling and overrides without a redeploy via updateFlag', async () => {
    const ab = createFramework();
    await ab.createFlag({ name: 'checkout_v2', enabled: false });
    expect(await ab.isFlagEnabled('checkout_v2', 'u1')).toBe(false);

    await ab.updateFlag('checkout_v2', { enabled: true });
    expect(await ab.isFlagEnabled('checkout_v2', 'u1')).toBe(true);

    await ab.updateFlag('checkout_v2', { userOverrides: { 'u-blocked': false } });
    expect(await ab.isFlagEnabled('checkout_v2', 'u-blocked')).toBe(false);
    expect(await ab.isFlagEnabled('checkout_v2', 'u2')).toBe(true);
  });

  it('assigns percentage rollouts deterministically per user', async () => {
    const ab = createFramework();
    await ab.createFlag({ name: 'gradual_rollout', enabled: true, rolloutPercentage: 50 });

    const first = await ab.isFlagEnabled('gradual_rollout', 'user-abc');
    const second = await ab.isFlagEnabled('gradual_rollout', 'user-abc');

    // Same user must always get the same decision across requests.
    expect(first).toBe(second);
  });

  it('returns false for a rollout flag when no user is supplied', async () => {
    const ab = createFramework();
    await ab.createFlag({ name: 'partial_flag', enabled: true, rolloutPercentage: 50 });

    // No user -> no stable bucket -> conservative fallback.
    expect(await ab.isFlagEnabled('partial_flag')).toBe(false);
  });

  it('rejects an out-of-range rollout percentage', async () => {
    const ab = createFramework();
    await expect(
      ab.createFlag({ name: 'bad_rollout', enabled: true, rolloutPercentage: 150 })
    ).rejects.toThrow('rolloutPercentage');
  });
});

describe('ABTestingFramework — cohort stability', () => {
  it('assigns the same user to the same variant across requests', async () => {
    const ab = createFramework();
    await ab.createExperiment({
      name: 'search_ranking',
      variants: [{ name: 'control' }, { name: 'treatment' }],
    });
    await ab.startExperiment('search_ranking');

    const first = await ab.assignUserToTest('user-stable', 'search_ranking');
    const second = await ab.assignUserToTest('user-stable', 'search_ranking');

    expect(first.variantId).toBe(second.variantId);
  });

  it('hashes users deterministically into a [0, 1) bucket', () => {
    const ab = createFramework();

    expect(ab.hashUserId('user-1')).toBe(ab.hashUserId('user-1'));
    expect(ab.hashToUnit('user-1')).toBe(ab.hashToUnit('user-1'));

    const bucket = ab.hashToUnit('user-1');
    expect(bucket).toBeGreaterThanOrEqual(0);
    expect(bucket).toBeLessThan(1);
  });

  it('defaults traffic allocation to an even split when omitted', async () => {
    const ab = createFramework();
    const experiment = await ab.createExperiment({
      name: 'even_split',
      variants: [{ name: 'A' }, { name: 'B' }, { name: 'C' }, { name: 'D' }],
    });

    expect(experiment.variants).toHaveLength(4);
    experiment.variants.forEach((variant) => {
      expect(variant.trafficWeight).toBe(25);
    });
  });
});
