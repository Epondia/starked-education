import {
  fetchMediaProgress,
  flushPendingProgress,
  progressFromTime,
  saveMediaProgress,
  toMediaProgress
} from '../mediaProgress';

describe('progressFromTime', () => {
  it('returns 0 progress when duration is unknown', () => {
    expect(progressFromTime(30, 0)).toEqual({ progress: 0, completed: false });
  });

  it('computes percentage progress from playback position', () => {
    expect(progressFromTime(60, 120)).toEqual({ progress: 50, completed: false });
  });

  it('clamps progress to the 0-100 range', () => {
    expect(progressFromTime(-10, 120)).toEqual({ progress: 0, completed: false });
    expect(progressFromTime(300, 120)).toEqual({ progress: 100, completed: true });
  });

  it('marks media as completed when played to the end', () => {
    expect(progressFromTime(119, 120)).toEqual({ progress: 99, completed: true });
  });
});

describe('toMediaProgress', () => {
  it('builds a normalized progress record', () => {
    const record = toMediaProgress({ contentId: 'c1', courseId: 'course-1', currentTime: 30, duration: 60 });
    expect(record).toMatchObject({
      contentId: 'c1',
      courseId: 'course-1',
      currentTime: 30,
      duration: 60,
      progress: 50,
      completed: false
    });
    expect(record.updatedAt).toEqual(expect.any(String));
  });
});

describe('saveMediaProgress', () => {
  beforeEach(() => {
    global.fetch = jest.fn();
    window.localStorage.clear();
  });

  it('posts progress to the API and mirrors it to the local cache', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({ ok: true, json: async () => ({ success: true }) });

    const result = await saveMediaProgress({ contentId: 'c1', courseId: 'course-1', userId: 'u1', currentTime: 45, duration: 90 });

    expect(result.saved).toBe(true);
    expect(result.queued).toBe(false);

    const body = JSON.parse((global.fetch as jest.Mock).mock.calls[0][1].body);
    expect(body).toMatchObject({
      content: 'c1',
      courseId: 'course-1',
      userId: 'u1',
      currentTime: 45,
      duration: 90,
      progress: 50
    });

    const cached = await fetchMediaProgress({ contentId: 'c1', userId: 'u1' });
    expect(cached?.currentTime).toBe(45);
  });

  it('queues the save locally when the API is unavailable', async () => {
    (global.fetch as jest.Mock).mockRejectedValueOnce(new Error('Network error'));

    const result = await saveMediaProgress({ contentId: 'c1', userId: 'u1', currentTime: 10, duration: 100 });

    expect(result.saved).toBe(false);
    expect(result.queued).toBe(true);
    // The position is still cached so playback can resume on this device.
    const cached = await fetchMediaProgress({ contentId: 'c1', userId: 'u1' });
    expect(cached?.currentTime).toBe(10);
  });

  it('de-duplicates queued saves for the same media and user', async () => {
    (global.fetch as jest.Mock).mockRejectedValue(new Error('offline'));

    await saveMediaProgress({ contentId: 'c1', userId: 'u1', currentTime: 10, duration: 100 });
    await saveMediaProgress({ contentId: 'c1', userId: 'u1', currentTime: 25, duration: 100 });
    await saveMediaProgress({ contentId: 'c2', userId: 'u1', currentTime: 5, duration: 100 });

    const queued = JSON.parse(window.localStorage.getItem('starked:media-progress:pending:v1') || '[]');
    expect(queued).toHaveLength(2);
    const c1 = queued.find((entry: { contentId: string }) => entry.contentId === 'c1');
    expect(c1.currentTime).toBe(25);
  });
});

describe('fetchMediaProgress', () => {
  beforeEach(() => {
    global.fetch = jest.fn();
    window.localStorage.clear();
  });

  it('returns the server record, unwrapping the data field', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        success: true,
        data: { contentId: 'c1', courseId: 'course-1', currentTime: 42, duration: 100, progress: 42, completed: false, updatedAt: '2026-01-01T00:00:00.000Z' }
      })
    });

    const progress = await fetchMediaProgress({ contentId: 'c1', courseId: 'course-1', userId: 'u1' });
    expect(progress?.currentTime).toBe(42);
    expect(progress?.contentId).toBe('c1');
  });

  it('falls back to the cached position when the API fails', async () => {
    await saveMediaProgress({ contentId: 'c1', userId: 'u1', currentTime: 30, duration: 60 });
    (global.fetch as jest.Mock).mockRejectedValueOnce(new Error('offline'));

    const progress = await fetchMediaProgress({ contentId: 'c1', userId: 'u1' });
    expect(progress?.currentTime).toBe(30);
  });

  it('returns null when there is no server or cached progress', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({ ok: false, json: async () => ({}) });
    const progress = await fetchMediaProgress({ contentId: 'missing', userId: 'u1' });
    expect(progress).toBeNull();
  });
});

describe('flushPendingProgress', () => {
  beforeEach(() => {
    global.fetch = jest.fn();
    window.localStorage.clear();
  });

  it('retries queued saves and clears the queue on success', async () => {
    await saveMediaProgress({ contentId: 'c1', userId: 'u1', currentTime: 10, duration: 100 });
    (global.fetch as jest.Mock).mockResolvedValue({ ok: true, json: async () => ({ success: true }) });

    const flushed = await flushPendingProgress();
    expect(flushed).toBe(1);
    const remaining = JSON.parse(window.localStorage.getItem('starked:media-progress:pending:v1') || '[]');
    expect(remaining).toHaveLength(0);
  });

  it('keeps queued saves that still fail', async () => {
    await saveMediaProgress({ contentId: 'c1', userId: 'u1', currentTime: 10, duration: 100 });
    (global.fetch as jest.Mock).mockRejectedValue(new Error('offline'));

    const flushed = await flushPendingProgress();
    expect(flushed).toBe(0);
    const remaining = JSON.parse(window.localStorage.getItem('starked:media-progress:pending:v1') || '[]');
    expect(remaining).toHaveLength(1);
  });
});
