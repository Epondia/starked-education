import {
  hashLearningState,
  verifyStateIntegrity,
  createStateVerificationToken,
  calculateStateSimilarity,
  mergeLearningstates,
  generateStateSnapshotId,
  createStateChangelogEntry,
} from '../stateHash';
import type { LearningStateSnapshot } from '@/types/quantum';

function makeState(overrides: Partial<LearningStateSnapshot> = {}): LearningStateSnapshot {
  return {
    id: 'state-1',
    timestamp: 1700000000000,
    userId: 'user-1',
    locationId: 'loc-1',
    courseId: 'course-1',
    moduleId: 'module-1',
    currentProgress: 42,
    comprehensionLevel: 80,
    engagementLevel: 90,
    focusState: 'deep_focus',
    memoryState: { topic: 'blockchain' },
    thinkingPattern: { strategy: 'chunking' },
    emotionalContext: 'motivated',
    lastAction: 'complete_quiz',
    actionTimestamp: 1700000001000,
    interactionMetrics: { quizScore: 95 },
    stateHash: '',
    version: 1,
    ...overrides,
  };
}

describe('hashLearningState', () => {
  it('produces a deterministic 64-char sha256 hash', () => {
    const state = makeState();
    const hash = hashLearningState(state);

    expect(hash).toMatch(/^[a-f0-9]{64}$/);
    expect(hashLearningState(state)).toBe(hash);
  });

  it('changes when the state content changes', () => {
    const base = makeState();
    const changed = makeState({ currentProgress: 43 });

    expect(hashLearningState(base)).not.toBe(hashLearningState(changed));
  });

  it('ignores key order differences via canonical serialization', () => {
    const a = makeState();
    const b = makeState();
    // Rebuild with keys in a different order.
    const reordered = {
      version: b.version,
      stateHash: b.stateHash,
      interactionMetrics: b.interactionMetrics,
      actionTimestamp: b.actionTimestamp,
      lastAction: b.lastAction,
      emotionalContext: b.emotionalContext,
      thinkingPattern: b.thinkingPattern,
      memoryState: b.memoryState,
      focusState: b.focusState,
      engagementLevel: b.engagementLevel,
      comprehensionLevel: b.comprehensionLevel,
      currentProgress: b.currentProgress,
      moduleId: b.moduleId,
      courseId: b.courseId,
      locationId: b.locationId,
      userId: b.userId,
      timestamp: b.timestamp,
      id: b.id,
    } as LearningStateSnapshot;

    expect(hashLearningState(a)).toBe(hashLearningState(reordered));
  });
});

describe('verifyStateIntegrity', () => {
  it('returns true for an unmodified state', () => {
    const state = makeState();
    const hash = hashLearningState(state);

    expect(verifyStateIntegrity(state, hash)).toBe(true);
  });

  it('returns false when the state was modified after hashing', () => {
    const state = makeState();
    const hash = hashLearningState(state);
    state.currentProgress = 99;

    expect(verifyStateIntegrity(state, hash)).toBe(false);
  });
});

describe('createStateVerificationToken', () => {
  it('returns a token bound to the state hash and timestamp', () => {
    const state = makeState();
    const nowSpy = jest.spyOn(Date, 'now');

    nowSpy.mockReturnValue(1700000000000);
    const first = createStateVerificationToken(state);
    nowSpy.mockReturnValue(1700000000001);
    const second = createStateVerificationToken(state);

    expect(first).toMatch(/^[a-f0-9]{64}$/);
    // Same state, different timestamp → different token.
    expect(first).not.toBe(second);

    nowSpy.mockRestore();
  });
});

describe('calculateStateSimilarity', () => {
  it('returns 1 for identical states', () => {
    const a = makeState();
    const b = makeState();

    expect(calculateStateSimilarity(a, b)).toBe(1);
  });

  it('returns 0 for completely different states', () => {
    const a = makeState();
    const b = makeState({
      userId: 'user-2',
      courseId: 'course-2',
      moduleId: 'module-2',
      currentProgress: 1,
      comprehensionLevel: 10,
      engagementLevel: 10,
      focusState: 'distracted',
      lastAction: 'logout',
      version: 2,
      interactionMetrics: { quizScore: 0 },
    });

    expect(calculateStateSimilarity(a, b)).toBe(0);
  });

  it('returns a partial score for partially matching states', () => {
    const a = makeState();
    const b = makeState({ currentProgress: 99 });

    const score = calculateStateSimilarity(a, b);
    expect(score).toBeGreaterThan(0);
    expect(score).toBeLessThan(1);
  });
});

describe('mergeLearningstates', () => {
  it('prefers the remote state when it is newer', () => {
    const local = makeState({ timestamp: 1000, emotionalContext: 'tired' });
    const remote = makeState({ timestamp: 2000, emotionalContext: '' });

    const merged = mergeLearningstates(local, remote);
    expect(merged.timestamp).toBe(2000);
    // Local emotional context is preserved when remote has none.
    expect(merged.emotionalContext).toBe('tired');
  });

  it('keeps the local state when it is newer', () => {
    const local = makeState({ timestamp: 2000, currentProgress: 77 });
    const remote = makeState({ timestamp: 1000, currentProgress: 10 });

    const merged = mergeLearningstates(local, remote);
    expect(merged.timestamp).toBe(2000);
    expect(merged.currentProgress).toBe(77);
  });

  it('keeps local state on equal timestamps', () => {
    const local = makeState({ timestamp: 5000, currentProgress: 50 });
    const remote = makeState({ timestamp: 5000, currentProgress: 60 });

    expect(mergeLearningstates(local, remote).currentProgress).toBe(50);
  });
});

describe('generateStateSnapshotId', () => {
  it('generates a unique 32-char hex id', () => {
    expect(generateStateSnapshotId()).toMatch(/^[a-f0-9]{32}$/);
    expect(generateStateSnapshotId()).not.toBe(generateStateSnapshotId());
  });
});

describe('createStateChangelogEntry', () => {
  it('builds a changelog entry with all fields', () => {
    const entry = createStateChangelogEntry(
      'state-1',
      'prev-hash',
      'new-hash',
      'merge',
      'loc-1',
    );

    expect(entry).toMatchObject({
      stateId: 'state-1',
      previousHash: 'prev-hash',
      newHash: 'new-hash',
      changeType: 'merge',
      sourceLocationId: 'loc-1',
    });
    expect(entry.timestamp).toEqual(expect.any(Number));
  });
});
