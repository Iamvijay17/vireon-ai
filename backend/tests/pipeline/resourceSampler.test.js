const { createResourceSampler } = require('../../src/services/pipeline/resourceSampler');

const flush = () => new Promise((r) => setImmediate(r));

function harness(overrides = {}) {
  let mem = { totalMb: 16000, freeMb: 8000 };
  let ticks = { idle: 0, total: 0 };
  let gpu = { usedMb: 800, freeMb: 5300, totalMb: 6144 };
  const h = {
    setMem: (m) => { mem = m; },
    setTicks: (t) => { ticks = t; },
    setGpu: (g) => { gpu = g; },
    readVram: jest.fn(async () => gpu),
    readMemory: jest.fn(() => mem),
    readCpuTicks: jest.fn(() => ticks),
    ...overrides,
  };
  h.sampler = createResourceSampler({ intervalMs: 5, readVram: h.readVram, readMemory: h.readMemory, readCpuTicks: h.readCpuTicks });
  return h;
}

describe('createResourceSampler', () => {
  it('takes an opening and a closing sample, so even an instant stage reports a measurement', async () => {
    const h = harness();
    h.sampler.start();
    h.setTicks({ idle: 50, total: 100 });
    const summary = await h.sampler.stop();

    expect(summary.sampleCount).toBeGreaterThanOrEqual(2);
    expect(summary.ram).toEqual({ peakUsedMb: 8000, minFreeMb: 8000, totalMb: 16000 });
    expect(summary.vram).toMatchObject({ startUsedMb: 800, peakUsedMb: 800, minFreeMb: 5300, totalMb: 6144 });
  });

  it('records the PEAK vram/ram and the LOWEST free memory seen across samples', async () => {
    const h = harness();
    h.sampler.start();
    await flush();
    h.setGpu({ usedMb: 5400, freeMb: 700, totalMb: 6144 });
    h.setMem({ totalMb: 16000, freeMb: 1200 });
    await new Promise((r) => setTimeout(r, 20));
    h.setGpu({ usedMb: 900, freeMb: 5200, totalMb: 6144 });
    h.setMem({ totalMb: 16000, freeMb: 9000 });
    const summary = await h.sampler.stop();

    expect(summary.vram).toMatchObject({ startUsedMb: 800, peakUsedMb: 5400, minFreeMb: 700 });
    expect(summary.ram).toMatchObject({ peakUsedMb: 14800, minFreeMb: 1200 });
  });

  it('reports vram as null - not zero - when nvidia-smi is unavailable, and still reports RAM', async () => {
    const h = harness({ readVram: jest.fn(async () => null) });
    h.sampler.start();
    const summary = await h.sampler.stop();
    expect(summary.vram).toBeNull();
    expect(summary.ram).not.toBeNull();
  });

  it('counts a throwing vram probe as unavailable instead of failing', async () => {
    const h = harness({ readVram: jest.fn(async () => { throw new Error('driver gone'); }) });
    h.sampler.start();
    await expect(h.sampler.stop()).resolves.toBeDefined();
  });

  it('derives CPU utilisation from tick deltas, and reports null when there is nothing to diff', async () => {
    const none = harness({ readCpuTicks: jest.fn(() => ({ idle: 10, total: 100 })) }); // never advances
    none.sampler.start();
    expect((await none.sampler.stop()).cpu).toBeNull();

    let n = 0;
    const busy = harness({ readCpuTicks: jest.fn(() => { n += 1; return { idle: n * 25, total: n * 100 }; }) }); // 75% busy
    busy.sampler.start();
    const cpu = (await busy.sampler.stop()).cpu;
    expect(cpu.peakPct).toBeCloseTo(75, 0);
    expect(cpu.avgPct).toBeCloseTo(75, 0);
  });

  it('keeps sampling on the interval while running and stops cleanly', async () => {
    const h = harness();
    h.sampler.start();
    await new Promise((r) => setTimeout(r, 40));
    const summary = await h.sampler.stop();
    expect(summary.sampleCount).toBeGreaterThan(3);

    const reads = h.readVram.mock.calls.length;
    await new Promise((r) => setTimeout(r, 30));
    expect(h.readVram.mock.calls.length).toBe(reads); // nothing after stop()
  });

  it('never runs two reads at once (the next waits for the previous to finish)', async () => {
    let inFlight = 0;
    let maxInFlight = 0;
    const h = harness({
      readVram: jest.fn(async () => {
        inFlight += 1;
        maxInFlight = Math.max(maxInFlight, inFlight);
        await new Promise((r) => setTimeout(r, 15)); // slower than the 5ms interval
        inFlight -= 1;
        return { usedMb: 1, freeMb: 1, totalMb: 2 };
      }),
    });
    h.sampler.start();
    await new Promise((r) => setTimeout(r, 60));
    await h.sampler.stop();
    expect(maxInFlight).toBe(1);
  });

  it('is idempotent: stop() twice returns the same summary, start() after stop() is a no-op', async () => {
    const h = harness();
    h.sampler.start();
    const first = await h.sampler.stop();
    expect(await h.sampler.stop()).toBe(first);
    h.sampler.start();
    expect(await h.sampler.stop()).toBe(first);
  });

  it('reports an empty summary when stopped without ever starting', async () => {
    const summary = await harness().sampler.stop();
    expect(summary).toMatchObject({ sampleCount: 0, durationMs: 0, vram: null, ram: null, cpu: null });
  });
});
