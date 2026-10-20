const {
  ResourceService, parseGpuReading, cpuPercentBetween, shapeTask, STALE_AFTER_MS,
} = require('../../src/services/system/ResourceService');

const cpuSample = (...idleBusy) => idleBusy.map(([idle, busy]) => ({ times: { user: busy, nice: 0, sys: 0, idle, irq: 0 } }));

describe('parseGpuReading', () => {
  it('reads name, utilisation, memory and temperature', () => {
    expect(parseGpuReading('NVIDIA GeForce RTX 2060, 37, 2210, 6144, 61\n')).toEqual({
      name: 'NVIDIA GeForce RTX 2060',
      utilizationPercent: 37,
      memoryUsedMb: 2210,
      memoryTotalMb: 6144,
      temperatureC: 61,
    });
  });

  it('keeps a missing figure null instead of turning it into 0', () => {
    const reading = parseGpuReading('GPU, [N/A], 100, 6144, [N/A]');
    expect(reading.utilizationPercent).toBeNull();
    expect(reading.temperatureC).toBeNull();
    expect(reading.memoryUsedMb).toBe(100);
  });

  it.each([[''], ['garbage'], ['GPU, 1, 2, 0, 3']])('returns null for %p', (out) => {
    expect(parseGpuReading(out)).toBeNull();
  });
});

describe('cpuPercentBetween', () => {
  it('is the busy share of the elapsed CPU time across all cores', () => {
    const before = cpuSample([100, 0], [100, 0]);
    const after = cpuSample([150, 50], [200, 0]); // core0: 50 idle/50 busy, core1: 100 idle
    expect(cpuPercentBetween(before, after)).toBe(25);
  });

  it('is null when no time elapsed between the samples', () => {
    const sample = cpuSample([10, 10]);
    expect(cpuPercentBetween(sample, sample)).toBeNull();
  });
});

describe('shapeTask', () => {
  const now = Date.parse('2026-10-20T12:00:00Z');

  it('marks a running task with a silent heartbeat as stale', () => {
    const row = { taskId: 't', status: 'running', service: 'tts', heartbeatAt: new Date(now - STALE_AFTER_MS - 1000) };
    expect(shapeTask(row, now).stale).toBe(true);
  });

  it('does not mark a live task, or a finished one, as stale', () => {
    expect(shapeTask({ taskId: 't', status: 'running', service: 'tts', heartbeatAt: new Date(now - 1000) }, now).stale).toBe(false);
    expect(shapeTask({ taskId: 't', status: 'completed', service: 'tts', heartbeatAt: new Date(now - 10 * STALE_AFTER_MS) }, now).stale).toBe(false);
  });

  it('treats an active task that never beat as stale and drops empty error objects', () => {
    const shaped = shapeTask({ taskId: 't', status: 'queued', service: 'llm', error: {} }, now);
    expect(shaped.stale).toBe(true);
    expect(shaped.error).toBeNull();
  });
});

describe('ResourceService', () => {
  const build = (overrides = {}) =>
    new ResourceService({
      osModule: { cpus: jest.fn(), totalmem: () => 16e9, freemem: () => 4e9 },
      exec: jest.fn().mockResolvedValue('GPU, 5, 100, 6144, 40'),
      sleep: () => Promise.resolve(),
      probeDependencies: async () => ({ mongo: true, redis: true, storage: false }),
      loadTaskModel: () => ({ find: () => ({ sort: () => ({ limit: () => ({ lean: async () => [] }) }) }) }),
      ...overrides,
    });

  it('reports memory as used = total - free', () => {
    expect(build().readMemory()).toEqual({ totalBytes: 16e9, usedBytes: 12e9, freeBytes: 4e9 });
  });

  it('returns a null GPU, not an error, when nvidia-smi is unavailable', async () => {
    const service = build({ exec: jest.fn().mockRejectedValue(new Error('ENOENT')) });
    await expect(service.readGpu()).resolves.toBeNull();
  });

  it('reports the task ledger as unavailable when it cannot be read', async () => {
    const service = build({ loadTaskModel: () => { throw new Error('no db'); } });
    await expect(service.readGpuTasks()).resolves.toEqual({ available: false, active: [], recent: [] });
  });

  it('assembles a full snapshot and survives a failing dependency probe', async () => {
    const os = { cpus: jest.fn().mockReturnValueOnce(cpuSample([0, 0])).mockReturnValue(cpuSample([50, 50])), totalmem: () => 8, freemem: () => 2 };
    const ok = await build({ osModule: os }).snapshot();
    expect(ok.cpu).toEqual({ percent: 50, cores: 1 });
    expect(ok.gpu.name).toBe('GPU');
    expect(ok.dependencies).toEqual({ mongo: true, redis: true, storage: false });

    const broken = await build({ osModule: os, probeDependencies: async () => { throw new Error('x'); } }).snapshot();
    expect(broken.dependencies).toEqual({ mongo: null, redis: null, storage: null });
  });
});
