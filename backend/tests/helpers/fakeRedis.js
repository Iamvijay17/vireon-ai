/**
 * An in-memory stand-in for the slice of ioredis the GPU ticket queue uses,
 * with real TTL semantics, so a test can model several processes sharing one
 * Redis - and one of them dying (its keys simply lapse).
 *
 * Several RedisTicketQueue instances can be built over the *same* FakeRedis.
 */
class FakeRedis {
  constructor(now = Date.now) {
    this.now = now;
    this.strings = new Map(); // key -> { value, expiresAt }
    this.zsets = new Map(); // key -> Map(member -> score)
  }

  _live(key) {
    const entry = this.strings.get(key);
    if (!entry) return null;
    if (entry.expiresAt !== null && entry.expiresAt <= this.now()) {
      this.strings.delete(key);
      return null;
    }
    return entry;
  }

  async set(key, value, ...args) {
    const px = args.indexOf('PX') !== -1 ? Number(args[args.indexOf('PX') + 1]) : null;
    if (args.includes('NX') && this._live(key)) return null;
    this.strings.set(key, { value, expiresAt: px === null ? null : this.now() + px });
    return 'OK';
  }

  async get(key) {
    return this._live(key)?.value ?? null;
  }

  async del(key) {
    return this.strings.delete(key) ? 1 : 0;
  }

  async pexpire(key, ms) {
    const entry = this._live(key);
    if (!entry) return 0;
    entry.expiresAt = this.now() + ms;
    return 1;
  }

  async exists(key) {
    return this._live(key) ? 1 : 0;
  }

  async zadd(key, score, member) {
    if (!this.zsets.has(key)) this.zsets.set(key, new Map());
    this.zsets.get(key).set(member, Number(score));
    return 1;
  }

  async zrange(key, start, stop) {
    const set = this.zsets.get(key);
    if (!set) return [];
    const sorted = [...set.entries()].sort((a, b) => a[1] - b[1]).map(([member]) => member);
    return sorted.slice(start, stop === -1 ? undefined : stop + 1);
  }

  async zrem(key, member) {
    return this.zsets.get(key)?.delete(member) ? 1 : 0;
  }

  async quit() {}
}

module.exports = { FakeRedis };
