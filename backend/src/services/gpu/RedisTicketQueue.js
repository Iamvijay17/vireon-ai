const { abortableDelay, makeAbortError } = require('../../utils/abortableDelay');

/**
 * The cross-process half of the GPU queue.
 *
 * Several processes share one card (the video worker, the course worker, the
 * API for Image Studio / voice previews). `RedisLease` already guarantees only
 * one of them holds the card at a time, but a lease alone is a free-for-all:
 * whoever polls at the right millisecond wins, there is no notion of who has
 * waited longest or whose work is interactive. This is the line they stand in
 * first, so the lease is only ever contended by whoever is next.
 *
 * Redis layout (all keys carry a TTL, so a crashed process drops out by itself):
 *
 *   gpuq:waiting      ZSET  ticketId -> score (GpuTaskQueue.score: lower goes first)
 *   gpuq:hb:<ticket>  STR   JSON { owner, service, jobId, stage } - the ticket's
 *                           heartbeat. A ticket whose heartbeat has lapsed is
 *                           dead: it is skipped and removed by whoever sees it.
 *   gpuq:key:<key>    STR   owner id - "this exact task is queued or running";
 *                           the cross-process duplicate guard.
 *
 * `client` needs only: set, get, del, pexpire, exists, zadd, zrange, zrem.
 */
const WAITING = 'gpuq:waiting';
const HEARTBEAT = (id) => `gpuq:hb:${id}`;
const TASK_KEY = (key) => `gpuq:key:${key}`;

class RedisTicketQueue {
  constructor({ client, owner, ttlMs = 15_000, pollMs = 250 } = {}) {
    if (!client) throw new Error('RedisTicketQueue needs a Redis client');
    this.client = client;
    this.owner = owner || `proc-${process.pid}`;
    this.ttlMs = ttlMs;
    this.pollMs = pollMs;
  }

  _renewEvery() {
    return Math.max(20, Math.floor(this.ttlMs / 3));
  }

  /**
   * Claim "this task is in flight" for `key`. Returns a handle to release, or
   * null when another live holder already has it (a duplicate). The claim is
   * renewed on a timer, so it outlives a long task but not a dead process.
   */
  async holdKey(key) {
    const redisKey = TASK_KEY(key);
    const ok = await this.client.set(redisKey, this.owner, 'PX', this.ttlMs, 'NX');
    if (!ok) return null;

    const timer = setInterval(() => {
      this.client.pexpire(redisKey, this.ttlMs).catch(() => {});
    }, this._renewEvery());
    timer.unref?.();

    return {
      release: async () => {
        clearInterval(timer);
        // Only delete our own claim - it may have lapsed and been re-taken.
        if ((await this.client.get(redisKey).catch(() => null)) === this.owner) {
          await this.client.del(redisKey).catch(() => {});
        }
      },
    };
  }

  /**
   * Join the line. `score` comes from GpuTaskQueue so local and global
   * ordering agree. Returns a ticket: await `waitForHead()` until it is this
   * process's turn, then `leave()` (always - it also stops the heartbeat).
   */
  async enter({ id, score, meta = {} }) {
    const beat = JSON.stringify({ owner: this.owner, ...meta });
    await this.client.set(HEARTBEAT(id), beat, 'PX', this.ttlMs);
    await this.client.zadd(WAITING, score, id);

    const timer = setInterval(() => {
      this.client.pexpire(HEARTBEAT(id), this.ttlMs).catch(() => {});
    }, this._renewEvery());
    timer.unref?.();

    let left = false;
    const leave = async () => {
      if (left) return;
      left = true;
      clearInterval(timer);
      await this.client.zrem(WAITING, id).catch(() => {});
      await this.client.del(HEARTBEAT(id)).catch(() => {});
    };

    const waitForHead = async ({ signal } = {}) => {
      for (;;) {
        if (signal?.aborted) throw makeAbortError();
        if ((await this._firstLive()) === id) return;
        await abortableDelay(this.pollMs, signal);
      }
    };

    return { id, waitForHead, leave };
  }

  /** The first ticket in line that still has a heartbeat; dead ones are pruned on the way. */
  async _firstLive() {
    const ids = await this.client.zrange(WAITING, 0, 19);
    for (const id of ids) {
      if (await this.client.exists(HEARTBEAT(id))) return id;
      await this.client.zrem(WAITING, id).catch(() => {});
    }
    return null;
  }

  async close() {
    await this.client.quit?.().catch(() => {});
  }

  /** Everyone currently in line, in order - for the status endpoint. */
  async snapshot() {
    const ids = await this.client.zrange(WAITING, 0, 49);
    const waiting = [];
    for (const id of ids) {
      const raw = await this.client.get(HEARTBEAT(id));
      if (!raw) continue; // dead ticket, pruned by the next _firstLive()
      try {
        waiting.push({ id, ...JSON.parse(raw) });
      } catch {
        waiting.push({ id });
      }
    }
    return waiting;
  }
}

module.exports = { RedisTicketQueue };
