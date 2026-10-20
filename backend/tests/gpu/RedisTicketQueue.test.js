const { RedisTicketQueue } = require('../../src/services/gpu/RedisTicketQueue');
const { FakeRedis } = require('../helpers/fakeRedis');

const queueFor = (redis, owner, opts = {}) => new RedisTicketQueue({ client: redis, owner, ttlMs: 200, pollMs: 5, ...opts });
const tick = (ms = 15) => new Promise((r) => setTimeout(r, ms));

describe('RedisTicketQueue ordering', () => {
  it('serves tickets from different processes in score order', async () => {
    const redis = new FakeRedis();
    const a = queueFor(redis, 'worker-a');
    const b = queueFor(redis, 'worker-b');

    const late = await a.enter({ id: 'late', score: 200 });
    const early = await b.enter({ id: 'early', score: 100 });

    const order = [];
    const lateTurn = late.waitForHead().then(() => { order.push('late'); return late.leave(); });
    const earlyTurn = early.waitForHead().then(async () => { order.push('early'); await tick(20); return early.leave(); });
    await Promise.all([lateTurn, earlyTurn]);

    expect(order).toEqual(['early', 'late']);
  });

  it('skips a ticket whose process died (heartbeat lapsed) instead of waiting behind it', async () => {
    const redis = new FakeRedis();
    const dead = queueFor(redis, 'dead', { ttlMs: 30 });
    const live = queueFor(redis, 'live');

    await dead.enter({ id: 'ghost', score: 1 });
    // The crash: no more heartbeats, so the key lapses.
    redis.strings.get('gpuq:hb:ghost').expiresAt = Date.now() - 1;
    const mine = await live.enter({ id: 'mine', score: 2 });

    await mine.waitForHead();
    expect(await redis.zrange('gpuq:waiting', 0, -1)).toEqual(['mine']); // ghost was pruned
    await mine.leave();
  });

  it('waitForHead rejects with AbortError when the signal fires', async () => {
    const redis = new FakeRedis();
    const q = queueFor(redis, 'a');
    await q.enter({ id: 'first', score: 1 });
    const second = await q.enter({ id: 'second', score: 2 });

    const controller = new AbortController();
    const waiting = second.waitForHead({ signal: controller.signal });
    controller.abort();
    await expect(waiting).rejects.toMatchObject({ name: 'AbortError' });
    await second.leave();
  });

  it('leave() removes the ticket and is idempotent', async () => {
    const redis = new FakeRedis();
    const q = queueFor(redis, 'a');
    const t = await q.enter({ id: 't', score: 1 });
    await t.leave();
    await t.leave();
    expect(await redis.zrange('gpuq:waiting', 0, -1)).toEqual([]);
    expect(await redis.exists('gpuq:hb:t')).toBe(0);
  });

  it('keeps the heartbeat alive while a ticket waits longer than the TTL', async () => {
    const redis = new FakeRedis();
    const q = queueFor(redis, 'a', { ttlMs: 60 });
    const t = await q.enter({ id: 't', score: 1 });
    await tick(150);
    expect(await redis.exists('gpuq:hb:t')).toBe(1);
    await t.leave();
  });

  it('snapshot lists live tickets with their metadata', async () => {
    const redis = new FakeRedis();
    const q = queueFor(redis, 'worker-a');
    await q.enter({ id: 't1', score: 1, meta: { service: 'tts', jobId: 'j1' } });
    const snap = await q.snapshot();
    expect(snap).toEqual([expect.objectContaining({ id: 't1', owner: 'worker-a', service: 'tts', jobId: 'j1' })]);
    await q.close();
  });
});

describe('RedisTicketQueue duplicate guard', () => {
  it('only one process can hold a task key', async () => {
    const redis = new FakeRedis();
    const a = queueFor(redis, 'a');
    const b = queueFor(redis, 'b');

    const first = await a.holdKey('job1:audio:tts');
    expect(first).not.toBeNull();
    expect(await b.holdKey('job1:audio:tts')).toBeNull();

    await first.release();
    const again = await b.holdKey('job1:audio:tts');
    expect(again).not.toBeNull();
    await again.release();
  });

  it('a crashed holder key lapses so the task can run again', async () => {
    const redis = new FakeRedis();
    const a = queueFor(redis, 'a');
    await a.holdKey('k');
    redis.strings.get('gpuq:key:k').expiresAt = Date.now() - 1;
    const b = await queueFor(redis, 'b').holdKey('k');
    expect(b).not.toBeNull();
    await b.release();
  });

  it('release does not delete a claim that has since been taken by someone else', async () => {
    const redis = new FakeRedis();
    const a = queueFor(redis, 'a');
    const hold = await a.holdKey('k');
    redis.strings.get('gpuq:key:k').expiresAt = Date.now() - 1;
    const other = await queueFor(redis, 'b').holdKey('k');
    await hold.release();
    expect(await redis.get('gpuq:key:k')).toBe('b');
    await other.release();
  });
});
