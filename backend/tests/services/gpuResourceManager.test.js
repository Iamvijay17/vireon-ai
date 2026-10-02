jest.mock('../../src/services/common/LoggerService', () => ({
  info: jest.fn(), warn: jest.fn(), error: jest.fn(), success: jest.fn(),
}));

const { GPUResourceManager, STATE } = require('../../src/services/localAI/gpuResourceManager');

/**
 * A single shared "Redis" that several FakeLease instances contend over, so
 * a test can model two worker PROCESSES on one GPU - the exact scenario the
 * in-process Map cannot see and the Redis lease exists to fix.
 */
class FakeRedis {
  constructor() {
    this.keys = new Map(); // name -> token
    this.releaseWaiters = new Map(); // name -> Set<fn>
    this.demandHandlers = new Map(); // name -> Set<fn>
  }
}

class FakeLease {
  constructor(shared) {
    this.shared = shared;
    this.closed = false;
  }

  async acquire(name, { ttlMs = 30000 } = {}) {
    for (;;) {
      if (!this.shared.keys.has(name)) {
        const token = `${Math.random()}`;
        this.shared.keys.set(name, token);
        return { name, token, ttlMs };
      }
      // Announce demand, then wait for a release - same protocol as the real
      // RedisLease.acquire loop, including its poll timeout. The timeout
      // matters: a holder that was busy the first time demand arrived only
      // hands off later, and a wake-up-only wait would miss that release.
      for (const h of this.shared.demandHandlers.get(name) || []) h();
      await new Promise((resolve) => {
        if (!this.shared.releaseWaiters.has(name)) this.shared.releaseWaiters.set(name, new Set());
        const waiters = this.shared.releaseWaiters.get(name);
        const wake = () => { clearTimeout(timer); waiters.delete(wake); resolve(); };
        const timer = setTimeout(wake, 5);
        waiters.add(wake);
      });
    }
  }

  async release({ name, token }) {
    if (this.shared.keys.get(name) !== token) return false;
    this.shared.keys.delete(name);
    const waiters = this.shared.releaseWaiters.get(name);
    if (waiters) {
      this.shared.releaseWaiters.set(name, new Set());
      for (const w of waiters) w();
    }
    return true;
  }

  async renew() { return true; }

  async signalDemand(name) {
    for (const h of this.shared.demandHandlers.get(name) || []) h();
  }

  async onDemand(name, handler) {
    if (!this.shared.demandHandlers.has(name)) this.shared.demandHandlers.set(name, new Set());
    this.shared.demandHandlers.get(name).add(handler);
    return () => this.shared.demandHandlers.get(name).delete(handler);
  }

  async close() { this.closed = true; }
}

/** A registered service that records load/unload so tests can assert VRAM state. */
const fakeManager = (log, name) => ({
  loaded: false,
  ensureRunning: jest.fn(async function () { this.loaded = true; log.push(`load:${name}`); }),
  unload: jest.fn(async function () { this.loaded = false; log.push(`unload:${name}`); }),
  stop: jest.fn(async function () { this.loaded = false; log.push(`stop:${name}`); }),
});

const tick = () => new Promise((r) => setImmediate(r));

describe('GPUResourceManager without a lease (single process)', () => {
  it('serialises two services onto one slot, unloading the first', async () => {
    const log = [];
    const gpu = new GPUResourceManager();
    gpu.register('llm', fakeManager(log, 'llm'), { autoStop: false });
    gpu.register('tts', fakeManager(log, 'tts'), { autoStop: false });

    await gpu.withGPU('llm', async () => {});
    await gpu.withGPU('tts', async () => {});

    // llm stays warm after release, and is only evicted when tts needs the slot.
    expect(log).toEqual(['load:llm', 'unload:llm', 'load:tts']);
  });

  it('reuses a warm service without reloading it', async () => {
    const log = [];
    const gpu = new GPUResourceManager();
    gpu.register('llm', fakeManager(log, 'llm'), { autoStop: false });

    await gpu.withGPU('llm', async () => {});
    await gpu.withGPU('llm', async () => {});

    expect(log).toEqual(['load:llm']); // loaded once, reused the second time
  });

  it('reports coordinator "in-process"', async () => {
    const gpu = new GPUResourceManager();
    expect(gpu.getStatus().gpu.coordinator).toBe('in-process');
  });

  it('frees the slot when a registered process crashes', async () => {
    const log = [];
    const gpu = new GPUResourceManager();
    const listeners = {};
    const managed = { on: (evt, fn) => { listeners[evt] = fn; } };
    gpu.register('llm', fakeManager(log, 'llm'), { autoStop: false, process: managed });
    gpu.register('tts', fakeManager(log, 'tts'), { autoStop: false });

    await gpu.acquire('llm');
    listeners.exit({ expected: false });

    // llm is FAILED, so its slot no longer counts - tts gets in without
    // waiting on a dead owner.
    await gpu.withGPU('tts', async () => {});
    expect(gpu.getStatus().services.llm.status).toBe(STATE.FAILED);
  });
});

describe('GPUResourceManager with a lease (two processes, one GPU)', () => {
  let shared;
  let a;
  let b;
  let logA;
  let logB;

  beforeEach(() => {
    shared = new FakeRedis();
    logA = [];
    logB = [];
    a = new GPUResourceManager({ lease: new FakeLease(shared) });
    b = new GPUResourceManager({ lease: new FakeLease(shared) });
    a.register('llm', fakeManager(logA, 'A.llm'), { autoStop: false });
    b.register('tts', fakeManager(logB, 'B.tts'), { autoStop: false });
  });

  it('reports coordinator "redis"', () => {
    expect(a.getStatus().gpu.coordinator).toBe('redis');
  });

  it('never lets two processes load a model at the same time', async () => {
    const order = [];
    let concurrent = 0;
    let peak = 0;

    const work = (gpu, name) => gpu.withGPU(name, async () => {
      concurrent += 1;
      peak = Math.max(peak, concurrent);
      order.push(`start:${name}`);
      await new Promise((r) => setTimeout(r, 20));
      order.push(`end:${name}`);
      concurrent -= 1;
    });

    await Promise.all([work(a, 'llm'), work(b, 'tts')]);

    // The whole point of the lease: this is 1, not 2.
    expect(peak).toBe(1);
    // And the second process's work is strictly after the first finishes.
    expect(order.indexOf('end:llm')).toBeLessThan(order.indexOf('start:tts'));
  });

  it('holds the lease while work is in flight and gives it up when idle', async () => {
    await a.withGPU('llm', async () => {
      expect(a.getStatus().gpu.holdsProcessLease).toBe(true);
    });

    // autoStop: false, so llm is still warm - and the lease is still held,
    // which is what preserves warm reuse.
    expect(a.getStatus().gpu.holdsProcessLease).toBe(true);
    expect(shared.keys.has('gpu-slot')).toBe(true);
  });

  it('unloads a warm-but-idle service when another process asks for the card', async () => {
    await a.withGPU('llm', async () => {});
    expect(logA).toEqual(['load:A.llm']); // warm, lease still held

    // B now wants it. A is idle, so it should hand over rather than make B
    // wait out the idle timeout.
    await b.withGPU('tts', async () => {});

    expect(logA).toEqual(['load:A.llm', 'unload:A.llm']);
    expect(logB).toEqual(['load:B.tts']);
  });

  it('defers the handoff until the current operation finishes, never mid-work', async () => {
    let midWorkHandoff = false;

    const aWork = a.withGPU('llm', async () => {
      await new Promise((r) => setTimeout(r, 30));
      // If A gave up the lease while still working, this is where it shows.
      if (!a.getStatus().gpu.holdsProcessLease) midWorkHandoff = true;
    });

    await tick();
    const bWork = b.withGPU('tts', async () => {});

    await Promise.all([aWork, bWork]);

    expect(midWorkHandoff).toBe(false);
    expect(logA).toEqual(['load:A.llm', 'unload:A.llm']);
  });

  it('records a pending handoff while busy', async () => {
    let seenPending = false;

    const aWork = a.withGPU('llm', async () => {
      await new Promise((r) => setTimeout(r, 30));
      seenPending = a.getStatus().gpu.handoffPending;
    });

    await tick();
    const bWork = b.withGPU('tts', async () => {});
    await Promise.all([aWork, bWork]);

    expect(seenPending).toBe(true);
  });

  it('releases the lease after an idle-timeout eviction', async () => {
    const log = [];
    const gpu = new GPUResourceManager({ lease: new FakeLease(shared) });
    gpu.register('llm', fakeManager(log, 'llm'), { autoStop: true });

    jest.useFakeTimers();
    try {
      await gpu.withGPU('llm', async () => {});
      expect(shared.keys.has('gpu-slot')).toBe(true);
      jest.runOnlyPendingTimers();
    } finally {
      jest.useRealTimers();
    }

    // Let the eviction's async chain settle.
    await new Promise((r) => setTimeout(r, 10));
    expect(log).toEqual(['load:llm', 'unload:llm']);
    expect(shared.keys.has('gpu-slot')).toBe(false);
  });

  it('does not strand the card when a service fails to start', async () => {
    const failing = {
      ensureRunning: jest.fn(async () => { throw new Error('LM Studio refused to start'); }),
      unload: jest.fn(async () => {}),
    };
    a.register('broken', failing, { autoStop: false });

    await expect(a.withGPU('broken', async () => {})).rejects.toThrow('refused to start');

    // The lease must not be left held by a process with nothing loaded.
    expect(shared.keys.has('gpu-slot')).toBe(false);
    // ...so the other process still gets in.
    await b.withGPU('tts', async () => {});
    expect(logB).toEqual(['load:B.tts']);
  });

  it('lets a process move between its own services without re-acquiring', async () => {
    a.register('avatar', fakeManager(logA, 'A.avatar'), { autoStop: false });

    await a.withGPU('llm', async () => {});
    await a.withGPU('avatar', async () => {});

    // One lease acquisition covers both: the in-process state machine
    // handles the llm -> avatar handoff, including the unload.
    expect(logA).toEqual(['load:A.llm', 'unload:A.llm', 'load:A.avatar']);
    expect(shared.keys.has('gpu-slot')).toBe(true);
  });

  it('gives the card back on shutdown', async () => {
    await a.withGPU('llm', async () => {});
    expect(shared.keys.has('gpu-slot')).toBe(true);

    await a.shutdown();

    expect(shared.keys.has('gpu-slot')).toBe(false);
    expect(logA).toContain('unload:A.llm');
  });
});
