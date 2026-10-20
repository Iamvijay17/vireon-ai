jest.mock('../../src/services/common/LoggerService', () => ({
  info: jest.fn(), warn: jest.fn(), error: jest.fn(), success: jest.fn(), debug: jest.fn(),
}));

const config = require('../../src/config');
const { GPUResourceManager } = require('../../src/services/localAI/gpuResourceManager');
const { GpuScheduler, isServiceFailure } = require('../../src/services/gpu/GpuScheduler');
const { RedisTicketQueue } = require('../../src/services/gpu/RedisTicketQueue');
const { PRIORITY } = require('../../src/services/gpu/priorities');
const { GpuServiceUnavailableError, DuplicateGpuTaskError } = require('../../src/services/gpu/gpuErrors');
const { FakeRedis } = require('../helpers/fakeRedis');

const tick = (ms = 0) => new Promise((r) => setTimeout(r, ms));

/** A promise the test opens by hand - holds a task "on the GPU" until released. */
function gate() {
  let open;
  const promise = new Promise((resolve) => { open = resolve; });
  return { promise, open };
}

const fakeManager = (log, name, { failStart = null } = {}) => ({
  ensureRunning: jest.fn(async () => {
    if (failStart?.current) throw failStart.current;
    log.push(`load:${name}`);
  }),
  unload: jest.fn(async () => { log.push(`unload:${name}`); }),
  stop: jest.fn(async () => {}),
});

const settingsFor = (over = {}) => ({
  scheduler: { priorityWeightMs: 1000, affinityWindowMs: 0, taskRetries: 2, taskRetryBaseMs: 1, ticketTtlMs: 200, leasePollMs: 2 },
  vram: {
    admission: true, totalMb: 6144, reserveMb: 512, liveCheck: true, liveFactor: 0.8, pollMs: 2, admissionTimeoutMs: 40,
    estimateMb: { llm: 5000, tts: 5000, comfyui: 5000 },
    ...over.vram,
  },
  breaker: { threshold: 3, cooldownMs: 50, maxCooldownMs: 200, ...over.breaker },
  ...(over.scheduler ? { scheduler: { ...settingsBase.scheduler, ...over.scheduler } } : {}),
});
const settingsBase = settingsFor();

/** One process: a real GPUResourceManager + GpuScheduler over fake model services. */
function makeProcess({ settings = settingsFor(), maxConcurrent = 1, probe = null, global = null, ledger = null, now = Date.now, lease = null, failStart } = {}) {
  config.gpu.maxConcurrent = maxConcurrent;
  const log = [];
  const gpu = new GPUResourceManager({ lease });
  const managers = {};
  for (const name of ['llm', 'tts', 'comfyui']) {
    managers[name] = fakeManager(log, name, { failStart: failStart?.[name] });
    gpu.register(name, managers[name], { autoStop: false });
  }
  const scheduler = new GpuScheduler({ gpu, settings, maxConcurrent, probe, global, ledger, now });
  gpu.attachScheduler(scheduler);
  return { gpu, scheduler, managers, log };
}

const originalMax = config.gpu.maxConcurrent;
afterAll(() => { config.gpu.maxConcurrent = originalMax; });

describe('GpuScheduler basics', () => {
  it('returns fn result and leaves services warm exactly as withGPU always did', async () => {
    const { gpu, log } = makeProcess();
    expect(await gpu.withGPU('llm', async () => 42)).toBe(42);
    await gpu.withGPU('llm', async () => {});
    await gpu.withGPU('tts', async () => {});
    expect(log).toEqual(['load:llm', 'unload:llm', 'load:tts']); // llm loaded once, evicted for tts
  });

  it('releases the slot and runs the next task when fn throws', async () => {
    const { gpu } = makeProcess();
    await expect(gpu.withGPU('llm', async () => { throw new Error('bad prompt'); })).rejects.toThrow('bad prompt');
    expect(await gpu.withGPU('tts', async () => 'ok')).toBe('ok');
  });

  it('runs one task at a time when there is one slot, in arrival order', async () => {
    const { gpu } = makeProcess();
    const order = [];
    const g1 = gate();
    const t1 = gpu.withGPU('llm', async () => { order.push('1:start'); await g1.promise; order.push('1:end'); });
    await tick();
    const t2 = gpu.withGPU('tts', async () => { order.push('2:start'); });
    const t3 = gpu.withGPU('comfyui', async () => { order.push('3:start'); });
    await tick(5);
    expect(order).toEqual(['1:start']); // 2 and 3 wait in line
    g1.open();
    await Promise.all([t1, t2, t3]);
    expect(order).toEqual(['1:start', '1:end', '2:start', '3:start']);
  });

  it('serialises two tasks for the same service (a service is exclusive)', async () => {
    const { gpu } = makeProcess({ maxConcurrent: 2, settings: settingsFor({ vram: { admission: false } }) });
    const order = [];
    const g = gate();
    const a = gpu.withGPU('llm', async () => { order.push('a:start'); await g.promise; order.push('a:end'); });
    await tick();
    const b = gpu.withGPU('llm', async () => { order.push('b:start'); });
    await tick(5);
    expect(order).toEqual(['a:start']);
    g.open();
    await Promise.all([a, b]);
    expect(order).toEqual(['a:start', 'a:end', 'b:start']);
  });
});

describe('priority and affinity', () => {
  it('runs an interactive task before an older batch task', async () => {
    const { gpu } = makeProcess();
    const order = [];
    const g = gate();
    const running = gpu.withGPU('llm', () => g.promise);
    await tick();
    const batch = gpu.withGPU('tts', async () => { order.push('batch'); }, { priority: PRIORITY.BATCH });
    await tick(2);
    const interactive = gpu.withGPU('comfyui', async () => { order.push('interactive'); }, { priority: PRIORITY.INTERACTIVE });
    g.open();
    await Promise.all([running, batch, interactive]);
    expect(order).toEqual(['interactive', 'batch']);
  });

  it('prefers the already-loaded model within the affinity window to avoid a swap', async () => {
    const { gpu, log } = makeProcess({ settings: settingsFor({ scheduler: { affinityWindowMs: 60_000 } }) });
    const order = [];
    const g = gate();
    const running = gpu.withGPU('llm', async () => { await g.promise; });
    await tick();
    const tts = gpu.withGPU('tts', async () => { order.push('tts'); });
    await tick(2);
    const llm = gpu.withGPU('llm', async () => { order.push('llm'); });
    g.open();
    await Promise.all([running, tts, llm]);

    expect(order).toEqual(['llm', 'tts']); // newer llm task reused the warm model first
    expect(log.filter((l) => l === 'load:llm')).toHaveLength(1);
  });

  it('with affinity off, strict arrival order wins', async () => {
    const { gpu } = makeProcess({ settings: settingsFor({ scheduler: { affinityWindowMs: 0 } }) });
    const order = [];
    const g = gate();
    const running = gpu.withGPU('llm', async () => { await g.promise; });
    await tick();
    const tts = gpu.withGPU('tts', async () => { order.push('tts'); });
    await tick(2);
    const llm = gpu.withGPU('llm', async () => { order.push('llm'); });
    g.open();
    await Promise.all([running, tts, llm]);
    expect(order).toEqual(['tts', 'llm']);
  });
});

describe('duplicate tasks', () => {
  it('rejects a second identical task while the first is queued or running', async () => {
    const { gpu } = makeProcess();
    const g = gate();
    const first = gpu.withGPU('tts', () => g.promise, { jobId: 'job1', stage: 'audio' });
    await tick();
    await expect(gpu.withGPU('tts', async () => {}, { jobId: 'job1', stage: 'audio' })).rejects.toBeInstanceOf(DuplicateGpuTaskError);
    g.open();
    await first;
  });

  it('frees the key afterwards so the stage can legitimately run again', async () => {
    const { gpu } = makeProcess();
    await gpu.withGPU('tts', async () => {}, { jobId: 'job1', stage: 'audio' });
    await expect(gpu.withGPU('tts', async () => 'again', { jobId: 'job1', stage: 'audio' })).resolves.toBe('again');
  });

  it('frees the key when the task fails', async () => {
    const { gpu } = makeProcess();
    await expect(gpu.withGPU('tts', async () => { throw new Error('x'); }, { jobId: 'j', stage: 'audio' })).rejects.toThrow('x');
    await expect(gpu.withGPU('tts', async () => 'ok', { jobId: 'j', stage: 'audio' })).resolves.toBe('ok');
  });

  it('different stages or jobs are different tasks', async () => {
    const { gpu } = makeProcess();
    const g = gate();
    const a = gpu.withGPU('tts', () => g.promise, { jobId: 'j1', stage: 'audio' });
    await tick();
    const b = gpu.withGPU('tts', async () => {}, { jobId: 'j2', stage: 'audio' });
    g.open();
    await expect(Promise.all([a, b])).resolves.toBeDefined();
  });

  it('tasks without a jobId are never deduped', async () => {
    const { gpu } = makeProcess();
    await Promise.all([gpu.withGPU('tts', async () => {}), gpu.withGPU('tts', async () => {})]);
  });

  it('catches the same task coming from another process', async () => {
    const redis = new FakeRedis();
    const a = makeProcess({ global: new RedisTicketQueue({ client: redis, owner: 'a', ttlMs: 200, pollMs: 2 }) });
    const b = makeProcess({ global: new RedisTicketQueue({ client: redis, owner: 'b', ttlMs: 200, pollMs: 2 }) });
    const g = gate();
    const first = a.gpu.withGPU('tts', () => g.promise, { jobId: 'job1', stage: 'audio' });
    await tick(5);
    await expect(b.gpu.withGPU('tts', async () => {}, { jobId: 'job1', stage: 'audio' })).rejects.toBeInstanceOf(DuplicateGpuTaskError);
    g.open();
    await first;
  });
});

describe('cancellation', () => {
  it('a queued task is dropped when its signal aborts and never runs', async () => {
    const { gpu } = makeProcess();
    const g = gate();
    const running = gpu.withGPU('llm', () => g.promise);
    await tick();

    const controller = new AbortController();
    const fn = jest.fn();
    const queued = gpu.withGPU('tts', fn, { signal: controller.signal });
    const behind = gpu.withGPU('comfyui', async () => 'behind');
    await tick();
    controller.abort();
    await expect(queued).rejects.toMatchObject({ name: 'AbortError' });

    g.open();
    await running;
    expect(await behind).toBe('behind'); // the aborted task did not block the line
    expect(fn).not.toHaveBeenCalled();
  });

  it('an already-aborted signal fails immediately', async () => {
    const { gpu } = makeProcess();
    const controller = new AbortController();
    controller.abort();
    await expect(gpu.withGPU('tts', async () => {}, { signal: controller.signal })).rejects.toMatchObject({ name: 'AbortError' });
  });
});

describe('service availability', () => {
  const refused = () => Object.assign(new Error('connect ECONNREFUSED 127.0.0.1:7860'), { code: 'ECONNREFUSED' });

  it('stops sending tasks to a service that keeps failing to start, then recovers', async () => {
    const clock = { t: 1000 };
    const failStart = { tts: { current: new Error('TTS failed to become ready after 180 seconds.') } };
    const { gpu, managers } = makeProcess({ failStart, now: () => clock.t });

    for (let i = 0; i < 3; i += 1) {
      await expect(gpu.withGPU('tts', async () => {})).rejects.toThrow('failed to become ready');
    }
    expect(managers.tts.ensureRunning).toHaveBeenCalledTimes(3);

    // Breaker is open: fail fast, without another startup attempt.
    const err = await gpu.withGPU('tts', async () => {}).catch((e) => e);
    expect(err).toBeInstanceOf(GpuServiceUnavailableError);
    expect(err.retryAfterMs).toBeGreaterThan(0);
    expect(managers.tts.ensureRunning).toHaveBeenCalledTimes(3);

    // Other services are unaffected.
    await expect(gpu.withGPU('llm', async () => 'fine')).resolves.toBe('fine');

    // After the cooldown one probe is let through; success closes the breaker.
    clock.t += 60;
    failStart.tts.current = null;
    await expect(gpu.withGPU('tts', async () => 'back')).resolves.toBe('back');
    await expect(gpu.withGPU('tts', async () => 'steady')).resolves.toBe('steady');
  });

  it('a task error that is not a service failure never trips the breaker', async () => {
    const { gpu } = makeProcess();
    for (let i = 0; i < 10; i += 1) {
      await expect(gpu.withGPU('llm', async () => { throw new Error('model returned invalid JSON'); })).rejects.toThrow('invalid JSON');
    }
    await expect(gpu.withGPU('llm', async () => 'ok')).resolves.toBe('ok');
  });

  it('service errors raised while running do count', async () => {
    const { gpu } = makeProcess();
    for (let i = 0; i < 3; i += 1) {
      await expect(gpu.withGPU('tts', async () => { throw refused(); })).rejects.toMatchObject({ code: 'ECONNREFUSED' });
    }
    await expect(gpu.withGPU('tts', async () => 'x')).rejects.toBeInstanceOf(GpuServiceUnavailableError);
  });

  it('classifies service failures vs caller errors', () => {
    expect(isServiceFailure(refused())).toBe(true);
    expect(isServiceFailure(Object.assign(new Error('x'), { response: { status: 503 } }))).toBe(true);
    expect(isServiceFailure(new Error('socket hang up'))).toBe(true);
    expect(isServiceFailure(new Error('invalid prompt'))).toBe(false);
    expect(isServiceFailure(Object.assign(new Error('Pre-render validation failed'), { permanent: true }))).toBe(false);
    expect(isServiceFailure(Object.assign(new Error('aborted'), { name: 'AbortError' }))).toBe(false);
    expect(isServiceFailure(null)).toBe(false);
  });
});

describe('task retries', () => {
  const refused = () => Object.assign(new Error('connect ECONNREFUSED'), { code: 'ECONNREFUSED' });

  it('retries a service failure with the GPU released in between', async () => {
    const { gpu, log } = makeProcess();
    let calls = 0;
    const result = await gpu.withGPU('llm', async () => {
      calls += 1;
      if (calls === 1) throw refused();
      return 'recovered';
    }, { retries: 2 });
    expect(result).toBe('recovered');
    expect(calls).toBe(2);
    expect(log.filter((l) => l === 'load:llm')).toHaveLength(1); // the model stayed warm across the retry
  });

  it('does not retry unless the caller opts in', async () => {
    const { gpu } = makeProcess();
    let calls = 0;
    await expect(gpu.withGPU('llm', async () => { calls += 1; throw refused(); })).rejects.toMatchObject({ code: 'ECONNREFUSED' });
    expect(calls).toBe(1);
  });

  it('does not retry a caller error', async () => {
    const { gpu } = makeProcess();
    let calls = 0;
    await expect(gpu.withGPU('llm', async () => { calls += 1; throw new Error('bad prompt'); }, { retries: 3 })).rejects.toThrow('bad prompt');
    expect(calls).toBe(1);
  });

  it('gives up after the budget and surfaces the last error', async () => {
    const { gpu } = makeProcess({ settings: settingsFor({ breaker: { threshold: 0 } }) });
    let calls = 0;
    await expect(gpu.withGPU('llm', async () => { calls += 1; throw refused(); }, { retries: 2 })).rejects.toMatchObject({ code: 'ECONNREFUSED' });
    expect(calls).toBe(3);
  });

  it('lets another service use the card while a failed task backs off', async () => {
    const { gpu } = makeProcess({ settings: settingsFor({ scheduler: { taskRetryBaseMs: 40 }, breaker: { threshold: 0 } }) });
    const order = [];
    let calls = 0;
    const flaky = gpu.withGPU('llm', async () => {
      calls += 1;
      order.push(`llm:${calls}`);
      if (calls === 1) throw refused();
    }, { retries: 1 });
    await tick(5);
    const other = gpu.withGPU('tts', async () => { order.push('tts'); });
    await Promise.all([flaky, other]);
    expect(order).toEqual(['llm:1', 'tts', 'llm:2']);
  });

  it('`retries: true` uses the configured default', async () => {
    const { gpu } = makeProcess({ settings: settingsFor({ scheduler: { taskRetries: 1 }, breaker: { threshold: 0 } }) });
    let calls = 0;
    await expect(gpu.withGPU('llm', async () => { calls += 1; throw refused(); }, { retries: true })).rejects.toBeDefined();
    expect(calls).toBe(2);
  });

  it('stops retrying once the signal aborts', async () => {
    const { gpu } = makeProcess({ settings: settingsFor({ scheduler: { taskRetryBaseMs: 200 }, breaker: { threshold: 0 } }) });
    const controller = new AbortController();
    let calls = 0;
    const task = gpu.withGPU('llm', async () => { calls += 1; throw refused(); }, { retries: 5, signal: controller.signal });
    await tick(20);
    controller.abort();
    await expect(task).rejects.toMatchObject({ name: 'AbortError' });
    expect(calls).toBe(1);
  });
});

describe('VRAM-aware admission', () => {
  it('keeps two 5GB services exclusive on a 6GB card even with two slots', async () => {
    const { gpu } = makeProcess({ maxConcurrent: 2 });
    const order = [];
    const g = gate();
    const a = gpu.withGPU('llm', async () => { order.push('llm:start'); await g.promise; order.push('llm:end'); });
    await tick();
    const b = gpu.withGPU('tts', async () => { order.push('tts:start'); });
    await tick(5);
    expect(order).toEqual(['llm:start']);
    g.open();
    await Promise.all([a, b]);
    expect(order).toEqual(['llm:start', 'llm:end', 'tts:start']);
  });

  it('lets both run together on a 24GB card with two slots', async () => {
    const { gpu } = makeProcess({ maxConcurrent: 2, settings: settingsFor({ vram: { totalMb: 24576 } }) });
    const order = [];
    const g = gate();
    const a = gpu.withGPU('llm', async () => { order.push('llm:start'); await g.promise; });
    await tick();
    const b = gpu.withGPU('tts', async () => { order.push('tts:start'); });
    await tick(5);
    expect(order).toEqual(['llm:start', 'tts:start']); // concurrent
    g.open();
    await Promise.all([a, b]);
  });

  it('keeps both models loaded on a big card, evicts the idle one on a small card', async () => {
    const big = makeProcess({ maxConcurrent: 2, settings: settingsFor({ vram: { totalMb: 24576 } }) });
    await big.gpu.withGPU('llm', async () => {});
    await big.gpu.withGPU('tts', async () => {});
    expect(big.log).toEqual(['load:llm', 'load:tts']); // nothing evicted

    const small = makeProcess({ maxConcurrent: 2 });
    await small.gpu.withGPU('llm', async () => {});
    await small.gpu.withGPU('tts', async () => {});
    expect(small.log).toEqual(['load:llm', 'unload:llm', 'load:tts']); // 5GB + 5GB > 5.6GB budget
  });

  it('vram admission off falls back to slot counting only', async () => {
    const { gpu, log } = makeProcess({ maxConcurrent: 2, settings: settingsFor({ vram: { admission: false } }) });
    await gpu.withGPU('llm', async () => {});
    await gpu.withGPU('tts', async () => {});
    expect(log).toEqual(['load:llm', 'load:tts']);
  });

  describe('live memory check', () => {
    const probeOf = (readings) => {
      let i = 0;
      return { read: jest.fn(async () => readings[Math.min(i++, readings.length - 1)]) };
    };

    it('waits while another application holds the VRAM, then proceeds when it frees up', async () => {
      const probe = probeOf([
        { usedMb: 5800, totalMb: 6144, freeMb: 300 },
        { usedMb: 5800, totalMb: 6144, freeMb: 300 },
        { usedMb: 200, totalMb: 6144, freeMb: 5900 },
      ]);
      const { gpu, managers } = makeProcess({ probe, settings: settingsFor({ vram: { admissionTimeoutMs: 2000 } }) });
      await gpu.withGPU('tts', async () => {});
      expect(probe.read.mock.calls.length).toBeGreaterThanOrEqual(3);
      expect(managers.tts.ensureRunning).toHaveBeenCalledTimes(1);
    });

    it('tolerates ordinary desktop use: 4.2GB free is enough for a 5GB estimate at the 0.8 factor', async () => {
      const probe = probeOf([{ usedMb: 1900, totalMb: 6144, freeMb: 4244 }]);
      const ledger = { queued: jest.fn(), started: jest.fn(), finished: jest.fn(), retrying: jest.fn() };
      const { gpu } = makeProcess({ probe, ledger });
      await gpu.withGPU('tts', async () => {});
      expect(probe.read).toHaveBeenCalledTimes(1); // passed the first look, never waited
      expect(ledger.started).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ admittedUnderPressure: false }));
    });

    it('proceeds anyway after the admission timeout and flags the task', async () => {
      const probe = probeOf([{ usedMb: 6000, totalMb: 6144, freeMb: 144 }]);
      const ledger = { queued: jest.fn(), started: jest.fn(), finished: jest.fn(), retrying: jest.fn() };
      const { gpu, managers } = makeProcess({ probe, ledger });
      await gpu.withGPU('tts', async () => 'went ahead');
      expect(managers.tts.ensureRunning).toHaveBeenCalledTimes(1);
      expect(ledger.started).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ admittedUnderPressure: true }));
    });

    it('does not block when nvidia-smi is unavailable', async () => {
      const probe = { read: jest.fn(async () => null) };
      const { gpu } = makeProcess({ probe });
      await expect(gpu.withGPU('tts', async () => 'ok')).resolves.toBe('ok');
    });

    it('skips the check when this process already has a model loaded (the reading would be its own)', async () => {
      const probe = probeOf([{ usedMb: 6000, totalMb: 6144, freeMb: 144 }]);
      const { gpu } = makeProcess({ probe, settings: settingsFor({ vram: { admissionTimeoutMs: 5000 } }) });
      await gpu.acquire('llm'); // warm llm occupies a slot
      await gpu.release('llm');
      probe.read.mockClear();
      await gpu.withGPU('llm', async () => {});
      expect(probe.read).not.toHaveBeenCalled();
    });

    it('a Stop during the memory wait cancels the task', async () => {
      const probe = probeOf([{ usedMb: 6000, totalMb: 6144, freeMb: 144 }]);
      const { gpu, managers } = makeProcess({ probe, settings: settingsFor({ vram: { admissionTimeoutMs: 5000 } }) });
      const controller = new AbortController();
      const task = gpu.withGPU('tts', async () => {}, { signal: controller.signal });
      await tick(10);
      controller.abort();
      await expect(task).rejects.toMatchObject({ name: 'AbortError' });
      expect(managers.tts.ensureRunning).not.toHaveBeenCalled();
    });
  });
});

describe('ledger and status', () => {
  it('records queued -> started -> completed with wait time', async () => {
    const ledger = { queued: jest.fn(), started: jest.fn(), finished: jest.fn(), retrying: jest.fn() };
    const { gpu } = makeProcess({ ledger });
    await gpu.withGPU('tts', async () => {}, { jobId: 'job1', stage: 'audio', label: 'narration' });
    await tick();

    expect(ledger.queued).toHaveBeenCalledWith(expect.objectContaining({ jobId: 'job1', stage: 'audio', service: 'tts', key: 'job1:audio:tts' }), expect.any(String));
    expect(ledger.started).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ attempt: 1, waitMs: expect.any(Number) }));
    expect(ledger.finished).toHaveBeenCalledWith(expect.anything(), 'completed', expect.objectContaining({ runMs: expect.any(Number) }));
  });

  it('records failures and cancellations distinctly', async () => {
    const ledger = { queued: jest.fn(), started: jest.fn(), finished: jest.fn(), retrying: jest.fn() };
    const { gpu } = makeProcess({ ledger });
    await gpu.withGPU('tts', async () => { throw new Error('boom'); }).catch(() => {});
    const controller = new AbortController();
    controller.abort();
    await gpu.withGPU('tts', async () => {}, { signal: controller.signal }).catch(() => {});
    await tick();
    const statuses = ledger.finished.mock.calls.map((c) => c[1]);
    expect(statuses).toEqual(['failed', 'cancelled']);
  });

  it('a throwing ledger never breaks the GPU task', async () => {
    const boom = () => { throw new Error('mongo down'); };
    const ledger = { queued: boom, started: boom, finished: boom, retrying: boom };
    const { gpu } = makeProcess({ ledger });
    await expect(gpu.withGPU('tts', async () => 'fine')).resolves.toBe('fine');
  });

  it('snapshot shows what is queued and running', async () => {
    const { gpu, scheduler } = makeProcess();
    const g = gate();
    const running = gpu.withGPU('llm', () => g.promise, { jobId: 'j1', stage: 'script' });
    await tick();
    const queued = gpu.withGPU('tts', async () => {}, { jobId: 'j2', stage: 'audio', priority: PRIORITY.BATCH });
    await tick();

    const snap = await scheduler.snapshot();
    expect(snap.running).toEqual([expect.objectContaining({ service: 'llm', jobId: 'j1', stage: 'script' })]);
    expect(snap.queued).toEqual([expect.objectContaining({ service: 'tts', jobId: 'j2', priority: PRIORITY.BATCH })]);
    expect(snap.policy).toEqual(expect.objectContaining({ maxConcurrent: 1, budgetMb: 5632 }));

    g.open();
    await Promise.all([running, queued]);
    const after = await scheduler.snapshot();
    expect(after.running).toEqual([]);
    expect(after.queued).toEqual([]);
  });
});

describe('cross-process ordering', () => {
  /** A shared FakeLease like the one in gpuResourceManager.test.js, reduced to what these tests need. */
  class SharedLease {
    constructor(shared) { this.shared = shared; }
    async acquire(name, { ttlMs = 30000 } = {}) {
      for (;;) {
        if (!this.shared.keys.has(name)) {
          const token = `${Math.random()}`;
          this.shared.keys.set(name, token);
          return { name, token, ttlMs };
        }
        for (const h of this.shared.demand) h();
        await tick(2);
      }
    }
    async release({ name, token }) {
      if (this.shared.keys.get(name) !== token) return false;
      this.shared.keys.delete(name);
      return true;
    }
    async renew() { return true; }
    async isHeld(name) { return this.shared.keys.has(name); }
    async signalDemand() { for (const h of this.shared.demand) h(); }
    async onDemand(name, handler) { this.shared.demand.add(handler); return () => this.shared.demand.delete(handler); }
    async close() {}
  }

  const twoProcesses = () => {
    const redis = new FakeRedis();
    const leaseState = { keys: new Map(), demand: new Set() };
    const mk = (owner) => makeProcess({
      lease: new SharedLease(leaseState),
      global: new RedisTicketQueue({ client: redis, owner, ttlMs: 500, pollMs: 2 }),
    });
    return { redis, a: mk('a'), b: mk('b'), c: mk('c') };
  };

  it('hands the card to the longest-waiting process, not whoever polls first', async () => {
    const { a, b, c } = twoProcesses();
    const order = [];
    const g = gate();

    const holder = a.gpu.withGPU('llm', async () => { order.push('a'); await g.promise; });
    await tick(10);
    const first = b.gpu.withGPU('tts', async () => { order.push('b'); });
    await tick(10);
    const second = c.gpu.withGPU('comfyui', async () => { order.push('c'); });
    await tick(10);

    g.open();
    await Promise.all([holder, first, second]);
    expect(order).toEqual(['a', 'b', 'c']);
  });

  it('an interactive task in another process jumps a batch task that arrived earlier', async () => {
    const { a, b, c } = twoProcesses();
    const order = [];
    const g = gate();

    const holder = a.gpu.withGPU('llm', async () => { order.push('a'); await g.promise; });
    await tick(10);
    const batch = b.gpu.withGPU('tts', async () => { order.push('batch'); }, { priority: PRIORITY.BATCH });
    await tick(10);
    const interactive = c.gpu.withGPU('comfyui', async () => { order.push('interactive'); }, { priority: PRIORITY.INTERACTIVE });
    await tick(10);

    g.open();
    await Promise.all([holder, batch, interactive]);
    expect(order).toEqual(['a', 'interactive', 'batch']);
  });

  it('a waiting process that dies does not block the line', async () => {
    const { redis, a, b } = twoProcesses();
    const g = gate();
    const holder = a.gpu.withGPU('llm', () => g.promise);
    await tick(10);

    // A ghost ticket at the head of the line whose owner has crashed.
    await redis.set('gpuq:hb:ghost', JSON.stringify({ owner: 'dead' }), 'PX', 500);
    await redis.zadd('gpuq:waiting', 0, 'ghost');
    redis.strings.get('gpuq:hb:ghost').expiresAt = Date.now() - 1;

    const waiting = b.gpu.withGPU('tts', async () => 'ran');
    g.open();
    await holder;
    await expect(waiting).resolves.toBe('ran');
  });

  it('fails open when Redis is unreachable for the ticket queue (the lease still protects the card)', async () => {
    const leaseState = { keys: new Map(), demand: new Set() };
    const broken = { enter: jest.fn().mockRejectedValue(new Error('redis down')), holdKey: jest.fn().mockRejectedValue(new Error('redis down')), snapshot: jest.fn() };
    const { gpu } = makeProcess({ lease: new SharedLease(leaseState), global: broken });
    await expect(gpu.withGPU('tts', async () => 'ok', { jobId: 'j', stage: 'audio' })).resolves.toBe('ok');
  });
});
