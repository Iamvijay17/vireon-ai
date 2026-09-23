const crypto = require('crypto');
const Redis = require('ioredis');
const config = require('../../config');
const LoggerService = require('../../services/common/LoggerService');

// Every held lease renews itself at 1/3 of its TTL, so a slow-but-alive
// holder never loses the lease to its own clock - only a holder that
// actually stops (crash, or forgot to release) goes silent long enough for
// the TTL to lapse.
const DEFAULT_TTL_MS = 30000;
const RENEW_FRACTION = 3;

// Atomic compare-then-act, run server-side so a lease can never be
// released or renewed by anyone but the token that currently holds it -
// the same guarantee `gpuResourceManager`'s in-process Map gets for free
// from being one object in one process, reproduced here across processes
// that only share Redis.
const RELEASE_SCRIPT = `
if redis.call("GET", KEYS[1]) == ARGV[1] then
  redis.call("DEL", KEYS[1])
  redis.call("PUBLISH", KEYS[2], "released")
  return 1
else
  return 0
end
`;

const RENEW_SCRIPT = `
if redis.call("GET", KEYS[1]) == ARGV[1] then
  redis.call("PEXPIRE", KEYS[1], ARGV[2])
  return 1
else
  return 0
end
`;

class LeaseTimeoutError extends Error {
  constructor(name, waitMs) {
    super(`Timed out after ${waitMs}ms waiting for lease "${name}"`);
    this.name = 'LeaseTimeoutError';
    this.leaseName = name;
  }
}

/**
 * A distributed mutex over Redis: at most one holder per `name` across
 * every process pointed at the same Redis instance. This is the Phase 4
 * primitive Move 04 calls for - GPU sequencing that currently only works
 * because there is exactly one worker process (gpuResourceManager's Map is
 * in that process's memory) becomes something a second worker, or a
 * capability-split worker, can actually participate in.
 *
 * Wired into GPUResourceManager (see its constructor's `lease` option),
 * which holds one process-wide lease named 'gpu-slot' whenever it has a
 * model loaded. Enabled by GPU_COORDINATOR=redis; the in-process path is
 * unchanged when it is off.
 */
class RedisLease {
  constructor({ host = config.redis.host, port = config.redis.port } = {}) {
    this._client = new Redis({ host, port, maxRetriesPerRequest: null });
    this._subscriber = null; // lazily created - most processes only ever release, never wait
    this._waiters = new Map(); // name -> Set<() => void>
    this._demandHandlers = new Map(); // name -> Set<() => void>
  }

  _key(name) {
    return `lease:${name}`;
  }

  _channel(name) {
    return `lease-released:${name}`;
  }

  // Separate channel from _channel(): "released" is a fact about the past
  // (the key is free now, re-attempt), "wanted" is a request about the
  // future (someone is queuing behind you - stop holding this for
  // convenience). A holder needs to hear the second without being woken by
  // every instance of the first. See GPUResourceManager's demand handler.
  _demandChannel(name) {
    return `lease-wanted:${name}`;
  }

  async _ensureSubscriber() {
    if (this._subscriber) return this._subscriber;
    this._subscriber = new Redis({ host: this._client.options.host, port: this._client.options.port, maxRetriesPerRequest: null });
    this._subscriber.on('message', (channel, message) => {
      if (channel.startsWith('lease-wanted:')) {
        const name = channel.replace(/^lease-wanted:/, '');
        for (const handler of this._demandHandlers.get(name) || []) handler();
        return;
      }

      if (message !== 'released') return;
      const name = channel.replace(/^lease-released:/, '');
      const waiters = this._waiters.get(name);
      if (!waiters) return;
      // Wake every current waiter for this name; each re-attempts SET NX
      // itself, so exactly one of them actually wins the freed key - this
      // is a wake-up hint, not a hand-off, so it's safe even if several
      // processes are woken by the same publish.
      for (const wake of waiters) wake();
    });
    return this._subscriber;
  }

  async _subscribeTo(name) {
    const subscriber = await this._ensureSubscriber();
    if (!this._waiters.has(name)) {
      this._waiters.set(name, new Set());
      await subscriber.subscribe(this._channel(name));
    }
  }

  /**
   * Announce that this process wants `name` but could not get it. A holder
   * that is only keeping the lease for convenience (e.g. a warm but idle
   * GPU service) can use this to give it up early instead of making the
   * waiter sit out the full idle timeout.
   *
   * Purely advisory: nothing about correctness depends on anyone listening,
   * and a holder doing real work is free to ignore it.
   */
  async signalDemand(name) {
    await this._client.publish(this._demandChannel(name), 'wanted');
  }

  /**
   * Run `handler` whenever another process signals demand for `name`.
   * Returns an unsubscribe function.
   */
  async onDemand(name, handler) {
    const subscriber = await this._ensureSubscriber();
    if (!this._demandHandlers.has(name)) {
      this._demandHandlers.set(name, new Set());
      await subscriber.subscribe(this._demandChannel(name));
    }
    this._demandHandlers.get(name).add(handler);
    return () => this._demandHandlers.get(name)?.delete(handler);
  }

  /**
   * Claim `name`, waiting if another holder has it. Returns a token that
   * must be passed to release()/renew() - anyone attempting either without
   * the current token is a no-op, never someone else's lease being torn
   * down out from under them.
   *
   * `waitMs: 0` fails immediately instead of waiting - useful for a caller
   * that wants to try a cheap resource and fall back rather than queue.
   */
  async acquire(name, { ttlMs = DEFAULT_TTL_MS, waitMs = Infinity, pollMs = 250 } = {}) {
    const token = crypto.randomUUID();
    const key = this._key(name);
    const deadline = waitMs === Infinity ? Infinity : Date.now() + waitMs;

    if (waitMs > 0) await this._subscribeTo(name);

    for (;;) {
      const ok = await this._client.set(key, token, 'PX', ttlMs, 'NX');
      if (ok) return { name, token, ttlMs };

      if (Date.now() >= deadline) throw new LeaseTimeoutError(name, waitMs);

      // Tell the current holder someone is queuing before sleeping. Re-sent
      // on every loop iteration rather than once, so a holder that starts
      // listening late (or was mid-operation the first time) still hears it.
      await this.signalDemand(name).catch(() => {});

      const remaining = deadline === Infinity ? pollMs : Math.min(pollMs, deadline - Date.now());
      await this._waitForWakeOrTimeout(name, remaining);
    }
  }

  _waitForWakeOrTimeout(name, ms) {
    return new Promise((resolve) => {
      const waiters = this._waiters.get(name);
      const wake = () => {
        clearTimeout(timer);
        waiters?.delete(wake);
        resolve();
      };
      const timer = setTimeout(wake, ms);
      timer.unref?.();
      waiters?.add(wake);
    });
  }

  /**
   * Release a lease. Returns false (not an error) if `token` no longer
   * owns it - already expired, already released, or won by someone else
   * in the meantime - since a caller racing its own TTL should never throw
   * over losing that race.
   */
  async release({ name, token }) {
    const result = await this._client.eval(RELEASE_SCRIPT, 2, this._key(name), this._channel(name), token);
    return result === 1;
  }

  /**
   * Extend a held lease's TTL. Returns false if `token` no longer owns
   * it - the caller (withLease's auto-renew loop) should treat that as
   * "the lease is gone, stop pretending you still hold it."
   */
  async renew({ name, token }, ttlMs = DEFAULT_TTL_MS) {
    const result = await this._client.eval(RENEW_SCRIPT, 1, this._key(name), token, String(ttlMs));
    return result === 1;
  }

  /**
   * Acquire -> run fn, auto-renewing every ttlMs/3 so a slow fn never
   * outlives its own lease -> always release. If a renewal ever reports
   * the lease was lost (expired despite renewal - e.g. a long GC pause, or
   * clock drift against Redis), fn is left running but LoggerService
   * records the loss loudly: two processes may now both believe they hold
   * this resource, which is the one failure mode a lease can't fully rule
   * out and the reason ttlMs should comfortably exceed any single
   * renewal-cycle hiccup.
   */
  async withLease(name, fn, { ttlMs = DEFAULT_TTL_MS, waitMs = Infinity } = {}) {
    const lease = await this.acquire(name, { ttlMs, waitMs });
    // A fixed floor here would outlive a short ttlMs entirely (e.g. a
    // 200ms lease with a 1000ms floor expires before ever renewing) - the
    // floor only needs to guard against a pathologically tiny ttlMs
    // causing a busy-renewal loop, so it scales with ttlMs instead.
    const renewMs = Math.max(20, Math.floor(ttlMs / RENEW_FRACTION));
    const interval = setInterval(async () => {
      const stillHeld = await this.renew(lease, ttlMs).catch(() => false);
      if (!stillHeld) {
        LoggerService.error(`[RedisLease] "${name}" lost its lease during renewal - possible double-hold`, { name });
      }
    }, renewMs);
    interval.unref?.();

    try {
      return await fn();
    } finally {
      clearInterval(interval);
      await this.release(lease);
    }
  }

  async close() {
    await this._client.quit().catch(() => {});
    if (this._subscriber) await this._subscriber.quit().catch(() => {});
  }
}

module.exports = { RedisLease, LeaseTimeoutError };
