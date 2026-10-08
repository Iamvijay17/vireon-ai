jest.mock('../../src/services/common/LoggerService', () => ({
  info: jest.fn(), warn: jest.fn(), error: jest.fn(), success: jest.fn(), debug: jest.fn(),
}));

const { GenerationCoordinator } = require('../../src/services/cache/GenerationCoordinator');

const makeLedger = () => ({ shared: jest.fn(), generated: jest.fn(), hit: jest.fn(), miss: jest.fn() });

/**
 * A tiny fake cache: `store` is what has been written, `lookup` reads it. `produce` writes
 * after a delay, like a real generation that takes time.
 */
function fakeCache({ produceMs = 20 } = {}) {
  const store = new Map();
  const calls = { produce: 0, lookup: 0 };
  return {
    store,
    calls,
    lookup: (key) => async () => {
      calls.lookup += 1;
      return store.has(key) ? { from: 'cache', value: store.get(key) } : null;
    },
    produce: (key, { fail = false } = {}) => async () => {
      calls.produce += 1;
      await new Promise((resolve) => setTimeout(resolve, produceMs));
      if (fail) throw new Error('generation failed');
      store.set(key, `made-${calls.produce}`);
      return { from: 'generated', value: store.get(key) };
    },
  };
}

const coordinator = (over = {}) => new GenerationCoordinator({ lock: null, ledger: makeLedger(), pollMs: 5, waitMs: 500, ...over });
const request = (cache, key = 'k1', over = {}) => ({ kind: 'image', key, lookup: cache.lookup(key), produce: cache.produce(key), ...over });

describe('cache hit and miss', () => {
  it('returns a cached artifact without generating', async () => {
    const cache = fakeCache();
    cache.store.set('k1', 'existing');
    const c = coordinator();
    const out = await c.run(request(cache));
    expect(out).toEqual({ value: { from: 'cache', value: 'existing' }, source: 'cache' });
    expect(cache.calls.produce).toBe(0);
  });

  it('generates on a miss, returns what was produced, and records how long it took', async () => {
    const cache = fakeCache();
    const c = coordinator();
    const out = await c.run(request(cache));
    expect(out.source).toBe('generated');
    expect(out.value.value).toBe('made-1');
    expect(c.ledger.generated).toHaveBeenCalledWith('image', 'k1', expect.any(Number));
    expect(c.ledger.generated.mock.calls[0][2]).toBeGreaterThanOrEqual(15);
  });

  it('a second request after the first finished is a plain cache hit', async () => {
    const cache = fakeCache();
    const c = coordinator();
    await c.run(request(cache));
    const again = await c.run(request(cache));
    expect(again.source).toBe('cache');
    expect(cache.calls.produce).toBe(1);
  });
});

describe('concurrent duplicate requests (single flight, one process)', () => {
  it('generates once for two simultaneous requests: A generates, B waits and reuses', async () => {
    const cache = fakeCache();
    const c = coordinator();
    const [a, b] = await Promise.all([c.run(request(cache)), c.run(request(cache))]);

    expect(cache.calls.produce).toBe(1);
    expect(a.source).toBe('generated');
    expect(b.source).toBe('shared');
    // B read what A stored, in B's own context (its own lookup), not A's result object.
    expect(b.value).toEqual({ from: 'cache', value: 'made-1' });
    expect(c.ledger.shared).toHaveBeenCalledWith('image', 'k1');
  });

  it('twenty simultaneous requests still generate once', async () => {
    const cache = fakeCache({ produceMs: 40 });
    const c = coordinator();
    const results = await Promise.all(Array.from({ length: 20 }, () => c.run(request(cache))));
    expect(cache.calls.produce).toBe(1);
    expect(results.filter((r) => r.source === 'generated')).toHaveLength(1);
    expect(results.filter((r) => r.source === 'shared')).toHaveLength(19);
  });

  it('different keys generate in parallel and do not wait on each other', async () => {
    const cache = fakeCache({ produceMs: 60 });
    const c = coordinator();
    const startedAt = Date.now();
    await Promise.all([c.run(request(cache, 'a')), c.run(request(cache, 'b')), c.run(request(cache, 'c'))]);
    expect(cache.calls.produce).toBe(3);
    expect(Date.now() - startedAt).toBeLessThan(160); // ~60ms, not ~180ms
  });

  it('different kinds with the same key are different artifacts', async () => {
    const cache = fakeCache();
    const c = coordinator();
    await Promise.all([c.run(request(cache, 'k', { kind: 'image' })), c.run(request(cache, 'k', { kind: 'tts-seg-raw' }))]);
    expect(cache.calls.produce).toBe(2);
  });

  it('a follower never fails because the leader did: it takes over and generates', async () => {
    const cache = fakeCache();
    const c = coordinator();
    const failing = c.run({ kind: 'image', key: 'k1', lookup: cache.lookup('k1'), produce: cache.produce('k1', { fail: true }) });
    const follower = c.run(request(cache));

    await expect(failing).rejects.toThrow('generation failed');
    const out = await follower;
    expect(out.source).toBe('generated');
    expect(cache.store.get('k1')).toBeDefined();
  });

  it('propagates a generation failure to the caller that generated, and leaves nothing in flight', async () => {
    const cache = fakeCache();
    const c = coordinator();
    await expect(c.run({ kind: 'image', key: 'k1', lookup: cache.lookup('k1'), produce: cache.produce('k1', { fail: true }) })).rejects.toThrow('generation failed');
    expect(c.inflight.size).toBe(0);
    // and the next request is free to try again
    const out = await c.run(request(cache));
    expect(out.source).toBe('generated');
  });

  it('when the cache is off (nothing is ever found), a waiting request generates for itself rather than hanging', async () => {
    const calls = { produce: 0 };
    const c = coordinator();
    const run = () => c.run({
      kind: 'image', key: 'k', lookup: async () => null,
      produce: async () => { calls.produce += 1; await new Promise((r) => setTimeout(r, 15)); return 'v'; },
    });
    const [a, b] = await Promise.all([run(), run()]);
    expect([a.source, b.source]).toEqual(['generated', 'generated']);
    expect(calls.produce).toBe(2);
  });
});

describe('across processes (distributed lock)', () => {
  const fakeLock = (over = {}) => ({
    acquire: jest.fn().mockResolvedValue({ acquired: true, token: 't1' }),
    isHeld: jest.fn().mockResolvedValue(false),
    extend: jest.fn().mockResolvedValue(true),
    release: jest.fn().mockResolvedValue(true),
    ...over,
  });

  it('takes the lock around a generation and releases it afterwards', async () => {
    const lock = fakeLock();
    const cache = fakeCache();
    await coordinator({ lock }).run(request(cache));
    expect(lock.acquire).toHaveBeenCalledWith('image:k1', expect.any(Number));
    expect(lock.release).toHaveBeenCalledWith('image:k1', 't1');
  });

  it('releases the lock even when the generation fails', async () => {
    const lock = fakeLock();
    const cache = fakeCache();
    await expect(coordinator({ lock }).run({ kind: 'image', key: 'k1', lookup: cache.lookup('k1'), produce: cache.produce('k1', { fail: true }) })).rejects.toThrow();
    expect(lock.release).toHaveBeenCalledWith('image:k1', 't1');
  });

  it('when another process holds it, waits and reads that process\'s result instead of generating', async () => {
    const cache = fakeCache();
    const lock = fakeLock({ acquire: jest.fn().mockResolvedValue({ acquired: false }), isHeld: jest.fn().mockResolvedValue(true) });
    const c = coordinator({ lock });
    // the other process finishes shortly
    setTimeout(() => cache.store.set('k1', 'from-other-process'), 30);

    const out = await c.run(request(cache));
    expect(out.source).toBe('shared');
    expect(out.value.value).toBe('from-other-process');
    expect(cache.calls.produce).toBe(0);
    expect(c.ledger.shared).toHaveBeenCalledWith('image', 'k1');
  });

  it('when the other process lets go without leaving a result, takes over', async () => {
    const cache = fakeCache();
    let held = true;
    const lock = fakeLock({
      acquire: jest.fn()
        .mockResolvedValueOnce({ acquired: false })     // first look: someone else has it
        .mockResolvedValue({ acquired: true, token: 't2' }), // afterwards: free
      isHeld: jest.fn(async () => held),
    });
    setTimeout(() => { held = false; }, 25); // the holder died / failed
    const out = await coordinator({ lock }).run(request(cache));
    expect(out.source).toBe('generated');
    expect(cache.calls.produce).toBe(1);
    expect(lock.release).toHaveBeenCalledWith('image:k1', 't2');
  });

  it('stops waiting after waitMs and generates rather than hanging forever', async () => {
    const cache = fakeCache();
    const lock = fakeLock({ acquire: jest.fn().mockResolvedValue({ acquired: false }), isHeld: jest.fn().mockResolvedValue(true) });
    const out = await coordinator({ lock, waitMs: 60 }).run(request(cache));
    expect(out.source).toBe('generated');
    expect(cache.calls.produce).toBe(1);
  });

  it('generates without the lock when Redis is unavailable - the lock is an optimisation, never a gate', async () => {
    const cache = fakeCache();
    const lock = fakeLock({ acquire: jest.fn().mockRejectedValue(new Error('ECONNREFUSED')) });
    const out = await coordinator({ lock }).run(request(cache));
    expect(out.source).toBe('generated');
    expect(lock.release).not.toHaveBeenCalled();
  });

  it('stops waiting if the lock service disappears mid-wait', async () => {
    const cache = fakeCache();
    const lock = fakeLock({
      acquire: jest.fn().mockResolvedValueOnce({ acquired: false }).mockRejectedValue(new Error('gone')),
      isHeld: jest.fn().mockRejectedValue(new Error('gone')),
    });
    const out = await coordinator({ lock }).run(request(cache));
    expect(out.source).toBe('generated');
  });

  it('renews the lock while a long generation runs', async () => {
    const lock = fakeLock();
    const cache = fakeCache({ produceMs: 1300 });
    await coordinator({ lock, lockTtlMs: 3000 }).run(request(cache)); // renews every max(1000, ttl/3) = 1000ms
    expect(lock.extend).toHaveBeenCalledWith('image:k1', 't1', 3000);
  });
});
