const config = require('../../config');
const LoggerService = require('../common/LoggerService');
const ledger = require('./CacheLedger');

/**
 * Single-flight generation: when the same artifact is asked for twice at once, it is
 * generated ONCE and the second request reuses it.
 *
 *   Request A: cache miss -> generate -> store
 *   Request B: same key, while A runs -> wait for A -> read what A stored   (no second generation)
 *
 * Two layers, because duplicates arise at two levels:
 *   - inside one process, an in-memory map of in-flight generations;
 *   - across processes (the video worker, the course worker, the API's Image Studio), a
 *     short Redis lock per key (distributedLock.js). Redis being down only loses the
 *     cross-process layer - the generation still happens.
 *
 * What a follower gets is NOT the leader's result object: after the leader finishes, the
 * follower runs its own `lookup()`, which materialises the cached artifact in the
 * follower's own context (its job's storage path, its working directory). If that finds
 * nothing - the leader failed, or the cache is off - the follower generates for itself.
 * So a failed leader never fails a follower, and the cache stays the single source of truth.
 *
 * Why this is not wired around every generation: GPU-bound work (TTS, ComfyUI) already
 * runs under the exclusive GPU lease, and its cache lookup happens *after* the lease is
 * taken - a second process waits for the card and then finds the first's result in the
 * cache. The coordinator covers what the lease does not: identical requests racing inside
 * the same lease window or outside any lease.
 */

const POLL_MS = 750;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

class GenerationCoordinator {
  /**
   * @param {object}  [opts]
   * @param {object|null} [opts.lock]  { acquire, isHeld, extend, release } or null for in-process only
   * @param {object}  [opts.ledger]
   * @param {number}  [opts.lockTtlMs]
   * @param {number}  [opts.waitMs]    longest a follower waits on another process before generating itself
   * @param {number}  [opts.pollMs]
   */
  constructor({ lock = null, ledger: ledgerImpl = ledger, lockTtlMs = config.cache.lockTtlMs, waitMs = config.cache.waitMs, pollMs = POLL_MS } = {}) {
    this.lock = lock;
    this.ledger = ledgerImpl;
    this.lockTtlMs = lockTtlMs;
    this.waitMs = waitMs;
    this.pollMs = pollMs;
    this.inflight = new Map(); // id -> Promise that settles when the leader is done (never rejects)
  }

  /**
   * @param {object}   req
   * @param {string}   req.kind      ledger kind ('image', 'tts-seg-raw', ...)
   * @param {string}   req.key       cache key
   * @param {() => Promise<any|null>} req.lookup   read the cache into the caller's context; null on a miss
   * @param {() => Promise<any>}      req.produce  generate AND store; its result is returned to the leader
   * @returns {Promise<{ value: any, source: 'cache'|'shared'|'generated' }>}
   */
  async run({ kind, key, lookup, produce }) {
    const id = `${kind}:${key}`;

    for (;;) {
      // 1. Already cached?
      const cached = await lookup();
      if (cached != null) return { value: cached, source: 'cache' };

      // 2. The same artifact is being generated in THIS process: wait, then read it.
      const running = this.inflight.get(id);
      if (running) {
        await running;
        const shared = await lookup();
        if (shared != null) {
          this.ledger.shared(kind, key);
          LoggerService.info('[Cache] reused an identical generation already in progress', { kind, key });
          return { value: shared, source: 'shared' };
        }
        continue; // the leader produced nothing usable: take the lead ourselves
      }

      // 3. We are the leader in this process.
      let done;
      this.inflight.set(id, new Promise((resolve) => { done = resolve; }));
      try {
        // 4. Is another PROCESS already generating it?
        const handle = await this._acquire(id);
        if (handle?.heldElsewhere) {
          const shared = await this._waitForOtherProcess(id, lookup);
          if (shared != null) {
            this.ledger.shared(kind, key);
            LoggerService.info('[Cache] reused a generation finished by another process', { kind, key });
            return { value: shared, source: 'shared' };
          }
          // It finished without leaving anything we can use (or we ran out of patience).
          // Whoever holds the lock now - possibly nobody - the work is ours.
          const retry = await this._acquire(id);
          return await this._generate({ kind, key, produce, handle: retry?.heldElsewhere ? null : retry });
        }
        return await this._generate({ kind, key, produce, handle });
      } finally {
        this.inflight.delete(id);
        done();
      }
    }
  }

  async _generate({ kind, key, produce, handle }) {
    const renew = handle?.token ? this._startRenewal(`${kind}:${key}`, handle.token) : null;
    const startedAt = Date.now();
    try {
      const value = await produce();
      this.ledger.generated(kind, key, Date.now() - startedAt);
      return { value, source: 'generated' };
    } finally {
      if (renew) clearInterval(renew);
      if (handle?.token) await this.lock.release(`${kind}:${key}`, handle.token).catch(() => {});
    }
  }

  /** { token } when we hold the lock, { heldElsewhere: true } when another process does, null when unavailable. */
  async _acquire(id) {
    if (!this.lock) return null;
    try {
      const result = await this.lock.acquire(id, this.lockTtlMs);
      return result.acquired ? { token: result.token } : { heldElsewhere: true };
    } catch (err) {
      LoggerService.debug('[Cache] cross-process lock unavailable - generating without it', { id, error: err.message });
      return null;
    }
  }

  _startRenewal(id, token) {
    const timer = setInterval(() => {
      this.lock.extend(id, token, this.lockTtlMs).catch(() => {});
    }, Math.max(1000, Math.floor(this.lockTtlMs / 3)));
    timer.unref?.();
    return timer;
  }

  /** Poll until the artifact appears, the other process lets go, or we run out of patience. */
  async _waitForOtherProcess(id, lookup) {
    const deadline = Date.now() + this.waitMs;
    while (Date.now() < deadline) {
      await sleep(this.pollMs);
      const found = await lookup();
      if (found != null) return found;
      let held;
      try {
        held = await this.lock.isHeld(id);
      } catch {
        return null; // lock service gone: stop waiting, generate
      }
      if (!held) return lookup(); // the holder finished (or died): one last look
    }
    LoggerService.warn('[Cache] gave up waiting on another process generating the same artifact', { id, waitMs: this.waitMs });
    return null;
  }
}

let shared = null;

/** The process-wide coordinator, created on first use so loading this module opens no socket. */
function getCoordinator() {
  if (!shared) {
    let lock = null;
    if (config.cache.coordination === 'redis') {
      const { RedisKeyLock } = require('./distributedLock');
      lock = new RedisKeyLock();
    }
    shared = new GenerationCoordinator({ lock });
  }
  return shared;
}

/** For tests. */
function resetCoordinator() {
  shared = null;
}

module.exports = { GenerationCoordinator, getCoordinator, resetCoordinator };
