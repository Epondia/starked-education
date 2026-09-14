/**
 * Queue Manager Tests — retry & dead-letter paths
 *
 * Verifies that an item which keeps failing is retried up to `maxRetries`
 * and then moved to a dead-letter queue (instead of being silently
 * dropped), which is the behaviour required for reliable email delivery.
 */

import QueueManager from '../src/services/queueManager';
import type { QueuedItem } from '../src/services/queueManager';

function buildItem(overrides: Partial<QueuedItem> = {}): Omit<QueuedItem, 'id' | 'queuedAt' | 'retryCount'> {
  return {
    userId: 'user-1',
    deviceId: 'device-1',
    entityType: 'notification' as any,
    entityId: 'entity-1',
    operation: 'create',
    version: 1,
    payload: {},
    ...overrides,
  };
}

describe('QueueManager — retry & dead-letter', () => {
  it('dead-letters an item after exhausting all retries', async () => {
    const qm = new QueueManager({ maxRetries: 2, retryDelayMs: 1 });
    const handler = jest.fn().mockRejectedValue(new Error('boom'));
    qm.setProcessHandler(handler);

    const queuedId = qm.enqueue(buildItem());
    const result = await qm.processQueue();

    // Two attempts (initial + one retry) before dead-lettering.
    expect(handler).toHaveBeenCalledTimes(2);
    expect(result).toEqual({ processed: 0, failed: 2 });
    expect(qm.getPendingCount()).toBe(0);

    // The failed item is preserved in the dead-letter queue, not dropped.
    expect(qm.getDeadLetterCount()).toBe(1);
    const dead = qm.getDeadLetterItems();
    expect(dead).toHaveLength(1);
    expect(dead[0].id).toBe(queuedId);
    expect(dead[0].retryCount).toBe(2);
    expect(dead[0].lastError).toBe('boom');
  });

  it('retries a transient failure and does not dead-letter on success', async () => {
    const qm = new QueueManager({ maxRetries: 3, retryDelayMs: 1 });
    const handler = jest.fn()
      .mockRejectedValueOnce(new Error('transient'))
      .mockResolvedValueOnce(undefined);
    qm.setProcessHandler(handler);

    qm.enqueue(buildItem());
    const result = await qm.processQueue();

    expect(handler).toHaveBeenCalledTimes(2);
    expect(result).toEqual({ processed: 1, failed: 1 });
    expect(qm.getPendingCount()).toBe(0);
    expect(qm.getDeadLetterCount()).toBe(0);
  });

  it('exposes and clears the dead-letter queue for inspection/recovery', async () => {
    const qm = new QueueManager({ maxRetries: 1, retryDelayMs: 1 });
    qm.setProcessHandler(jest.fn().mockRejectedValue(new Error('permanent')));

    qm.enqueue(buildItem());
    await qm.processQueue();

    expect(qm.getDeadLetterCount()).toBe(1);
    expect(qm.getDeadLetterItems()).toHaveLength(1);

    qm.clearDeadLetter();
    expect(qm.getDeadLetterCount()).toBe(0);
    expect(qm.getDeadLetterItems()).toHaveLength(0);
  });
});
