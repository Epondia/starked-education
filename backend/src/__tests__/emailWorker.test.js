/**
 * Email Worker Tests
 *
 * Verifies the periodic background worker that drains the email queue:
 *   - start()/stop() lifecycle is idempotent.
 *   - tick() invokes queueManager.processQueue() and aggregates stats.
 *   - Errors raised by the queue handler do not crash the worker.
 *   - getStats() returns the documented shape.
 */

const EmailWorkerModule = require('../workers/emailWorker');

function buildFakeQueueManager() {
  return {
    processQueue: jest.fn().mockResolvedValue({ processed: 2, failed: 1 }),
    getPendingCount: jest.fn().mockReturnValue(7),
    isProcessing: jest.fn().mockReturnValue(false),
  };
}

describe('EmailWorker', () => {
  let fakeQueue;

  beforeEach(() => {
    EmailWorkerModule.resetEmailWorker();
    fakeQueue = buildFakeQueueManager();
  });

  afterEach(() => {
    EmailWorkerModule.resetEmailWorker();
    jest.useRealTimers();
  });

  it('exports the EmailWorker class and singleton helpers', () => {
    expect(typeof EmailWorkerModule).toBe('function');
    expect(typeof EmailWorkerModule.getEmailWorker).toBe('function');
    expect(typeof EmailWorkerModule.resetEmailWorker).toBe('function');
  });

  it('starts the worker and runs an immediate tick', async () => {
    jest.useFakeTimers();
    const worker = new EmailWorkerModule({
      intervalMs: 1000,
      queueManager: fakeQueue,
    });

    worker.start();

    // Allow microtasks for the immediate tick to settle
    await Promise.resolve();
    await Promise.resolve();

    expect(worker.running).toBe(true);
    // Initial tick should have invoked processQueue at least once
    expect(fakeQueue.processQueue).toHaveBeenCalled();

    worker.stop();
  });

  it('runs processQueue on each interval tick', async () => {
    jest.useFakeTimers();
    const worker = new EmailWorkerModule({
      intervalMs: 500,
      queueManager: fakeQueue,
    });

    worker.start();
    await Promise.resolve();
    await Promise.resolve();

    const initialCalls = fakeQueue.processQueue.mock.calls.length;
    expect(initialCalls).toBeGreaterThanOrEqual(1);

    // Advance timers by several interval periods
    jest.advanceTimersByTime(2500);
    await Promise.resolve();
    await Promise.resolve();

    const totalCalls = fakeQueue.processQueue.mock.calls.length;
    expect(totalCalls).toBeGreaterThan(initialCalls);

    worker.stop();
  });

  it('aggregates processed / failed counters from each tick', async () => {
    const worker = new EmailWorkerModule({
      intervalMs: 1000,
      queueManager: fakeQueue,
    });

    fakeQueue.processQueue.mockResolvedValueOnce({ processed: 3, failed: 1 });
    fakeQueue.processQueue.mockResolvedValueOnce({ processed: 2, failed: 0 });

    await worker.tick();
    await worker.tick();

    const stats = worker.getStats();
    expect(stats.processed).toBe(5);
    expect(stats.failed).toBe(1);
    expect(stats.lastRunAt).toBeTruthy();
    expect(stats.lastError).toBeNull();
  });

  it('records lastError and continues running after a tick throws', async () => {
    const worker = new EmailWorkerModule({
      intervalMs: 1000,
      queueManager: fakeQueue,
    });

    // First call rejects, second succeeds
    fakeQueue.processQueue
      .mockRejectedValueOnce(new Error('queue exploded'))
      .mockResolvedValueOnce({ processed: 1, failed: 0 });

    await worker.tick();
    expect(worker.stats.lastError).toBe('queue exploded');

    await worker.tick();
    expect(worker.stats.lastError).toBeNull();
    expect(worker.stats.processed).toBe(1);
  });

  it('stop() is idempotent and clears the timer', () => {
    jest.useFakeTimers();
    const worker = new EmailWorkerModule({
      intervalMs: 1000,
      queueManager: fakeQueue,
    });

    worker.start();
    expect(worker.running).toBe(true);

    worker.stop();
    expect(worker.running).toBe(false);
    expect(worker.timer).toBeNull();

    // Stopping again is a no-op
    worker.stop();
    expect(worker.running).toBe(false);
  });

  it('start() is idempotent and does not schedule a second timer', async () => {
    jest.useFakeTimers();
    const worker = new EmailWorkerModule({
      intervalMs: 1000,
      queueManager: fakeQueue,
    });

    worker.start();
    const firstTimer = worker.timer;
    worker.start(); // second start should be a no-op
    expect(worker.timer).toBe(firstTimer);

    worker.stop();
  });

  it('getStats() exposes queue depth and worker state', async () => {
    const worker = new EmailWorkerModule({
      intervalMs: 1234,
      queueManager: fakeQueue,
    });

    worker.start();
    await Promise.resolve();
    await Promise.resolve();

    const stats = worker.getStats();
    expect(stats).toMatchObject({
      running: true,
      intervalMs: 1234,
      queue: {
        pending: 7,
        isProcessing: false,
      },
      processed: 2,
      failed: 1,
    });
    expect(stats.lastRunAt).toBeTruthy();

    worker.stop();
    expect(worker.getStats().running).toBe(false);
  });

  it('uses EMAIL_WORKER_INTERVAL_MS env var when no override given', () => {
    const original = process.env.EMAIL_WORKER_INTERVAL_MS;
    process.env.EMAIL_WORKER_INTERVAL_MS = '777';
    EmailWorkerModule.resetEmailWorker();

    const w = new EmailWorkerModule({ queueManager: fakeQueue });
    expect(w.intervalMs).toBe(777);

    if (original === undefined) {
      delete process.env.EMAIL_WORKER_INTERVAL_MS;
    } else {
      process.env.EMAIL_WORKER_INTERVAL_MS = original;
    }
  });
});
