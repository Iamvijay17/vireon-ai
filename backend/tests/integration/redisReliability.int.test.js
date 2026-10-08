/**
 * Redis / BullMQ reliability against a REAL Redis (no mocks): connectivity,
 * duplicate job ids, and what happens when the Redis connection drops and
 * comes back. These are the failure modes behind "Failed to send job status"
 * style incidents that mocked unit tests cannot reproduce.
 *
 * Outages are simulated with a small TCP proxy between the client under test
 * and Redis: `outage()` severs every open connection and refuses new ones,
 * `restore()` lets traffic through again. Redis itself never goes down, so
 * other tests (and a developer's own Redis) are unaffected. Nothing here sleeps
 * for a fixed time: every wait is "poll until this condition holds", bounded by
 * a timeout, so a slow CI runner makes a test slower, not flaky.
 *
 * Isolation: unique queue names and a unique pub/sub channel per run; nothing
 * calls FLUSHDB/FLUSHALL. Runs only with RUN_REDIS_TESTS=1 (CI sets it and
 * provides Redis), like retryQueue.int.test.js.
 */
const net = require('net');

const RUN = process.env.RUN_REDIS_TESTS === '1';
jest.setTimeout(45000);
const describeRedis = RUN ? describe : describe.skip;

const REDIS = { host: process.env.REDIS_HOST || '127.0.0.1', port: Number(process.env.REDIS_PORT) || 6379 };
const unique = `${process.pid}-${Date.now()}`;

// The bridge under test reads these. The channel is test-only so a developer
// machine's real API (subscribed to the real channel) never sees test traffic;
// the port is pointed at the proxy before the bridge is initialised.
const mockTestChannel = `vireon:test:job-events:${unique}`;
const mockRedisEndpoint = { host: REDIS.host, port: REDIS.port };
jest.mock('../../src/config', () => ({ redis: mockRedisEndpoint }));
jest.mock('../../src/constants', () => ({ ...jest.requireActual('../../src/constants'), REDIS_CHANNEL: mockTestChannel }));
jest.mock('../../src/services/common/LoggerService', () => ({
  info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn(),
}));

/** Resolves once `check()` is truthy; rejects with `what` after `timeoutMs`. */
async function waitUntil(check, what, timeoutMs = 20000, intervalMs = 25) {
  const start = Date.now();
  for (;;) {
    if (await check()) return;
    if (Date.now() - start > timeoutMs) throw new Error(`timed out waiting for: ${what}`);
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
}

/** TCP proxy to Redis that can be taken down and brought back. */
function createFlakyProxy(target) {
  const open = new Set();
  let down = false;
  let refused = 0;
  const server = net.createServer((client) => {
    if (down) {
      refused += 1;
      client.destroy();
      return;
    }
    const upstream = net.connect(target.port, target.host);
    open.add(client);
    open.add(upstream);
    const drop = () => {
      client.destroy();
      upstream.destroy();
      open.delete(client);
      open.delete(upstream);
    };
    client.on('error', drop);
    upstream.on('error', drop);
    client.on('close', drop);
    upstream.on('close', drop);
    client.pipe(upstream);
    upstream.pipe(client);
  });
  return {
    async start() {
      await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
      return server.address().port;
    },
    outage() {
      down = true;
      for (const socket of open) socket.destroy();
      open.clear();
    },
    restore() {
      down = false;
    },
    get refused() {
      return refused;
    },
    async stop() {
      for (const socket of open) socket.destroy();
      await new Promise((resolve) => server.close(resolve));
    },
  };
}

// ioredis options for clients that talk to Redis through the proxy: reconnect
// quickly so recovery tests finish in well under a second of real backoff.
const fastReconnect = { retryStrategy: (times) => Math.min(times * 25, 200) };

describeRedis('Redis connectivity', () => {
  it('answers PING and round-trips a value on a plain client', async () => {
    const Redis = require('ioredis');
    const client = new Redis({ ...REDIS, maxRetriesPerRequest: 1 });
    try {
      expect(await client.ping()).toBe('PONG');
      const key = `vireon:test:conn:${unique}`;
      await client.set(key, 'ok', 'EX', 30);
      expect(await client.get(key)).toBe('ok');
      await client.del(key);
    } finally {
      client.disconnect();
    }
  });

  it('exposes a ready BullMQ queue connection (what /ready pings)', async () => {
    const { Queue } = require('bullmq');
    const queue = new Queue(`vireon-test-conn-${unique}`, { connection: REDIS });
    try {
      const client = await queue.client;
      expect(await client.ping()).toBe('PONG');
    } finally {
      await queue.close();
    }
  });
});

describeRedis('BullMQ duplicate job ids', () => {
  it('keeps a single job when the same jobId is added twice (the contract the retry path works around)', async () => {
    const { Queue } = require('bullmq');
    const queue = new Queue(`vireon-test-dup-${unique}`, { connection: REDIS });
    try {
      const first = await queue.add('render-video', { n: 1 }, { jobId: 'job-dup' });
      const second = await queue.add('render-video', { n: 2 }, { jobId: 'job-dup' });

      expect(second.id).toBe(first.id);
      expect((await queue.getJobCounts('waiting')).waiting).toBe(1);
      // The first payload wins: the duplicate add is dropped, not merged.
      expect((await queue.getJob('job-dup')).data).toEqual({ n: 1 });
    } finally {
      await queue.obliterate({ force: true }).catch(() => {});
      await queue.close();
    }
  });
});

describeRedis('worker -> API pub/sub bridge across a Redis outage', () => {
  let proxy;
  let bridge;
  let direct;
  const received = [];

  const seen = (eventId) => received.some((payload) => payload.eventId === eventId);
  const subscribers = async () => Number((await direct.pubsub('NUMSUB', mockTestChannel))[1]);

  beforeAll(async () => {
    const Redis = require('ioredis');
    direct = new Redis(REDIS);
    proxy = createFlakyProxy(REDIS);
    mockRedisEndpoint.port = await proxy.start();
    mockRedisEndpoint.host = '127.0.0.1';

    // A stand-in Socket.IO server: records what would reach browsers.
    const { state } = require('../../src/services/common/socketService/state');
    state.io = {
      to: () => ({ emit: (event, payload) => received.push({ event, ...payload }) }),
      emit: (event, payload) => received.push({ event, ...payload }),
      close: () => {},
    };
    bridge = require('../../src/services/common/socketService/redisBridge');
    bridge.initRedis(); // subscriber + publisher, both through the proxy
    await waitUntil(async () => (await subscribers()) === 1, 'bridge subscribed');
  });

  afterAll(async () => {
    // Restore first: closing a client whose connection is down waits for the
    // reconnect, so a test that failed mid-outage must not hang the suite.
    proxy?.restore();
    await bridge?.close().catch(() => {});
    direct?.disconnect();
    await proxy?.stop();
  });

  beforeEach(() => {
    proxy.restore();
    received.length = 0;
  });

  it('forwards a worker event to the Socket.IO clients', async () => {
    bridge.publish('job-abc12345', 'jobProgress', { eventId: 'evt-ok', seq: 1, progress: 10 });

    await waitUntil(() => seen('evt-ok'), 'evt-ok forwarded');
    expect(received[0]).toMatchObject({ event: 'jobProgress', eventId: 'evt-ok', seq: 1, progress: 10 });
  });

  it('forwards a repeated event with the same eventId each time, so the client can dedupe it', async () => {
    const payload = { eventId: 'evt-repeat', seq: 4, progress: 40 };
    bridge.publish('job-abc12345', 'jobProgress', payload);
    bridge.publish('job-abc12345', 'jobProgress', payload);

    await waitUntil(() => received.filter((p) => p.eventId === 'evt-repeat').length === 2, 'both copies forwarded');
    expect(received.map((p) => p.seq)).toEqual([4, 4]);
  });

  it('resubscribes after the Redis connection is cut and events flow again', async () => {
    proxy.outage();
    await waitUntil(async () => (await subscribers()) === 0, 'server noticed the subscriber is gone');
    proxy.restore();
    await waitUntil(async () => (await subscribers()) === 1, 'bridge resubscribed on its own');

    // The worker side is a different process; publish from a plain client.
    const Redis = require('ioredis');
    const worker = new Redis(REDIS);
    try {
      await worker.publish(mockTestChannel, JSON.stringify({ type: 'jobProgress', jobId: 'job-abc12345', data: { eventId: 'evt-after-outage', seq: 9 } }));
    } finally {
      worker.disconnect();
    }

    await waitUntil(() => seen('evt-after-outage'), 'event after recovery forwarded');
  });

  it('sends an event published DURING the outage to Redis once the publisher reconnects (nothing is dropped or thrown)', async () => {
    // A separate, healthy subscriber stands in for "Redis received it". The
    // bridge's own subscriber is deliberately not used here: it may still be
    // resubscribing when the publisher gets back, and Redis pub/sub drops a
    // message that has no subscriber at that instant. That window is why every
    // event is also stored (JobEventService) and replayed on the next join.
    const Redis = require('ioredis');
    const probe = new Redis(REDIS);
    const arrived = [];
    probe.on('message', (_channel, message) => arrived.push(JSON.parse(message).data.eventId));
    await probe.subscribe(mockTestChannel);

    try {
      const refusedBefore = proxy.refused;
      proxy.outage();
      // Only the probe (which bypasses the proxy) is left subscribed.
      await waitUntil(async () => (await subscribers()) === 1, 'bridge connections severed');

      // The bridge's own publisher is disconnected right now. ioredis holds the
      // command and sends it on reconnect; nothing is dropped and nothing throws.
      expect(() => bridge.publish('job-abc12345', 'jobProgress', { eventId: 'evt-during-outage', seq: 12 })).not.toThrow();
      expect(arrived).not.toContain('evt-during-outage');

      proxy.restore();
      await waitUntil(() => arrived.includes('evt-during-outage'), 'queued event reached Redis after recovery');
      expect(arrived.filter((id) => id === 'evt-during-outage')).toHaveLength(1); // delivered once, not once per reconnect
      expect(proxy.refused).toBeGreaterThan(refusedBefore); // it really did wait out refused reconnects
    } finally {
      proxy.restore();
      probe.disconnect();
    }
    // The bridge is back too (probe gone, so exactly the bridge remains).
    await waitUntil(async () => (await subscribers()) === 1, 'bridge resubscribed');
  });
});

describeRedis('BullMQ worker across a Redis connection drop', () => {
  let proxy;
  let queue;
  let worker;
  const processed = [];
  const queueName = `vireon-test-outage-${unique}`;

  beforeAll(async () => {
    const { Queue, Worker } = require('bullmq');
    proxy = createFlakyProxy(REDIS);
    const port = await proxy.start();
    // The queue talks to Redis directly (the producer is a different process
    // in production); only the worker's connections go through the proxy.
    queue = new Queue(queueName, { connection: REDIS });
    worker = new Worker(
      queueName,
      async (job) => {
        processed.push(job.data.n);
      },
      { connection: { host: '127.0.0.1', port, ...fastReconnect }, concurrency: 1 }
    );
    worker.on('error', () => {}); // connection errors during the outage are expected
    await worker.waitUntilReady();
  });

  afterAll(async () => {
    proxy?.restore();
    await worker?.close().catch(() => {});
    await queue?.obliterate({ force: true }).catch(() => {});
    await queue?.close();
    await proxy?.stop();
  });

  beforeEach(() => {
    processed.length = 0;
  });

  it('processes jobs normally before any failure', async () => {
    await queue.add('work', { n: 1 });
    await waitUntil(() => processed.length === 1, 'job 1 processed');
    expect(processed).toEqual([1]);
  });

  it('picks up a job queued while its connection was down, exactly once', async () => {
    const refusedBefore = proxy.refused;
    proxy.outage();
    await waitUntil(() => proxy.refused > refusedBefore, 'worker attempted to reconnect and was refused');

    await queue.add('work', { n: 2 }); // lands in Redis while the worker is cut off
    expect(processed).toEqual([]);

    proxy.restore();
    await waitUntil(() => processed.length >= 1, 'job 2 processed after recovery');
    // Let any (incorrect) second delivery of the same job surface before asserting.
    await queue.add('work', { n: 3 });
    await waitUntil(() => processed.includes(3), 'job 3 processed');

    expect(processed).toEqual([2, 3]);
  });

  it('survives repeated drops without losing or duplicating work', async () => {
    for (let round = 1; round <= 3; round += 1) {
      const refusedBefore = proxy.refused;
      proxy.outage();
      await waitUntil(() => proxy.refused > refusedBefore, `reconnect refused in round ${round}`);
      proxy.restore();
    }
    const ids = [10, 11, 12, 13];
    for (const n of ids) await queue.add('work', { n });

    await waitUntil(() => processed.length >= ids.length, 'all jobs processed');
    expect([...processed].sort((a, b) => a - b)).toEqual(ids);
  });
});
