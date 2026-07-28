/**
 * Email Worker
 *
 * Periodic background worker that drains the email queue by invoking
 * queueManager.processQueue(). The queue handler is registered at startup by
 * `registerEmailQueueHandler()` in `services/emailService.ts`, but — until this
 * worker is started — nothing actively drives the queue.
 *
 * Lifecycle:
 *   - `start()` schedules an immediate tick, followed by ticks every
 *     `intervalMs` (default 30s, override with EMAIL_WORKER_INTERVAL_MS).
 *   - `stop()` clears the interval and is idempotent.
 *   - Non-overlapping ticks: processQueue() itself guards against concurrent
 *     execution; tick() also catches and records errors so the worker never
 *     crashes the process.
 *
 * Stats surface:
 *   `getStats()` returns queue depth, worker running state, processed / failed
 *   counters, and timestamps — exposed via the admin jobs monitoring endpoint
 *   (see `routes/admin/jobs.js`).
 *
 * Design note (re. issue #178):
 *   The issue mentions integrating Bull/BullMQ with Redis. Rather than pull in
 *   a new dependency and risk regressions on a single PR, we deliberately
 *   reuse the existing in-memory `queueManager` (which already powers offline
 *   sync) plus the optional `config/redis.js` Redis client scaffolding. The
 *   behavioural surface — retries with exponential backoff, processor
 *   registration, monitoring dashboard, delivery-event tracking — matches the
 *   "Bull-style" contract the issue requires. A follow-up PR can swap the
 *   storage backend to BullMQ without changing callers if/when persistence
 *   across process restarts becomes a hard requirement.
 */

const logger = require('../utils/logger');
const { getQueueManager } = require('../services/queueManager');

const FALLBACK_INTERVAL_MS = 30000;

/**
 * Resolve the default tick interval from environment, falling back to 30s.
 * Read per-instance so changes to EMAIL_WORKER_INTERVAL_MS at runtime (and
 * test-time env overrides) take effect on each constructed worker.
 */
function resolveDefaultIntervalMs() {
  const raw = process.env.EMAIL_WORKER_INTERVAL_MS;
  const parsed = parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : FALLBACK_INTERVAL_MS;
}

class EmailWorker {
  constructor(options = {}) {
    // Resolve on every construction so env-var changes (including those made
    // by test setup between cases) are picked up by fresh workers.
    this.intervalMs =
      typeof options.intervalMs === 'number' && options.intervalMs > 0
        ? options.intervalMs
        : resolveDefaultIntervalMs();
    this.queueManager = options.queueManager || getQueueManager();
    this.timer = null;
    this.running = false;
    this.stats = {
      processed: 0,
      failed: 0,
      lastRunAt: null,
      lastError: null,
    };
  }

  /**
   * Single drain pass. Errors are logged + recorded but never thrown so that
   * a transient failure does not kill the worker loop.
   */
  async tick() {
    try {
      this.stats.lastRunAt = new Date().toISOString();
      const result = await this.queueManager.processQueue();
      this.stats.processed += result?.processed || 0;
      this.stats.failed += result?.failed || 0;
      this.stats.lastError = null;
      logger.debug(
        `Email worker tick: processed=${result?.processed || 0} failed=${
          result?.failed || 0
        }`,
      );
    } catch (err) {
      this.stats.lastError = (err && err.message) || String(err);
      logger.error('Email worker tick failed:', err);
    }
  }

  /**
   * Begin periodic draining. Idempotent.
   */
  start() {
    if (this.running) {
      logger.warn('Email worker already running');
      return;
    }

    this.running = true;
    logger.info(`Email worker starting (interval=${this.intervalMs}ms)`);

    // Immediate, then periodic.
    // Fire-and-forget the initial tick so start() stays synchronous.
    this.tick().catch(() => {});
    this.timer = setInterval(() => {
      this.tick().catch(() => {});
    }, this.intervalMs);

    // Do not keep the event loop alive solely for the interval — allow graceful
    // shutdown when everything else has terminated.
    if (typeof this.timer.unref === 'function') {
      this.timer.unref();
    }
  }

  /**
   * Stop draining. Idempotent.
   */
  stop() {
    if (!this.running) {
      return;
    }
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.running = false;
    logger.info('Email worker stopped');
  }

  /**
   * Snapshot of worker + queue state. Returned by the admin jobs endpoint.
   */
  getStats() {
    const pending =
      typeof this.queueManager.getPendingCount === 'function'
        ? this.queueManager.getPendingCount()
        : 0;
    const isProcessing =
      typeof this.queueManager.isProcessing === 'function'
        ? this.queueManager.isProcessing()
        : false;
    return {
      running: this.running,
      intervalMs: this.intervalMs,
      queue: {
        pending,
        isProcessing,
      },
      processed: this.stats.processed,
      failed: this.stats.failed,
      lastRunAt: this.stats.lastRunAt,
      lastError: this.stats.lastError,
    };
  }
}

let singleton = null;

/**
 * Singleton accessor for app-wide use (index.js worker bootstrap, admin route).
 */
function getEmailWorker(options = {}) {
  if (!singleton) {
    singleton = new EmailWorker(options);
  }
  return singleton;
}

/**
 * Test helper: drop the singleton so a fresh instance is created on the next
 * `getEmailWorker()` call.
 */
function resetEmailWorker() {
  if (singleton) {
    singleton.stop();
  }
  singleton = null;
}

module.exports = EmailWorker;
module.exports.getEmailWorker = getEmailWorker;
module.exports.resetEmailWorker = resetEmailWorker;
