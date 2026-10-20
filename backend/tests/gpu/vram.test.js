const { parseNvidiaSmi, createVramProbe, budgetMb, fits } = require('../../src/services/gpu/vram');

describe('parseNvidiaSmi', () => {
  it('reads the first GPU row', () => {
    expect(parseNvidiaSmi('NVIDIA GeForce RTX 2060, 812, 6144, 5200\n')).toEqual({
      name: 'NVIDIA GeForce RTX 2060', usedMb: 812, totalMb: 6144, freeMb: 5200,
    });
  });

  it('only looks at the first GPU on a multi-GPU box', () => {
    expect(parseNvidiaSmi('A, 1, 100, 99\nB, 2, 200, 198\n').name).toBe('A');
  });

  it.each([[''], ['garbage'], ['A, x, y, z'], ['A, 1, 0, 0']])('returns null for %p', (out) => {
    expect(parseNvidiaSmi(out)).toBeNull();
  });
});

describe('createVramProbe', () => {
  const row = 'GPU, 100, 6144, 6044\n';

  it('caches a reading so a polling wait does not spawn nvidia-smi every time', async () => {
    let t = 0;
    const exec = jest.fn().mockResolvedValue(row);
    const probe = createVramProbe({ cacheMs: 1000, exec, now: () => t });

    await probe.read();
    t = 500;
    await probe.read();
    expect(exec).toHaveBeenCalledTimes(1);

    t = 1500;
    await probe.read();
    expect(exec).toHaveBeenCalledTimes(2);
  });

  it('`fresh` bypasses the cache', async () => {
    const exec = jest.fn().mockResolvedValue(row);
    const probe = createVramProbe({ cacheMs: 10_000, exec, now: () => 0 });
    await probe.read();
    await probe.read({ fresh: true });
    expect(exec).toHaveBeenCalledTimes(2);
  });

  it('returns null when nvidia-smi is unavailable (CPU-only box)', async () => {
    const probe = createVramProbe({ exec: jest.fn().mockRejectedValue(new Error('ENOENT')) });
    expect(await probe.read()).toBeNull();
  });

  it('shares one in-flight read between concurrent callers', async () => {
    const exec = jest.fn(() => new Promise((r) => setTimeout(() => r(row), 5)));
    const probe = createVramProbe({ cacheMs: 0, exec });
    await Promise.all([probe.read(), probe.read(), probe.read()]);
    expect(exec).toHaveBeenCalledTimes(1);
  });
});

describe('budget and fit', () => {
  it('budget is total minus reserve, never negative', () => {
    expect(budgetMb({ totalMb: 6144, reserveMb: 512 })).toBe(5632);
    expect(budgetMb({ totalMb: 100, reserveMb: 512 })).toBe(0);
  });

  it('two 5GB models do not fit a 6GB card, but do fit a 24GB one', () => {
    expect(fits({ candidateMb: 5000, residentMb: [5000], budget: 5632 })).toBe(false);
    expect(fits({ candidateMb: 5000, residentMb: [5000], budget: budgetMb({ totalMb: 24576, reserveMb: 512 }) })).toBe(true);
  });

  it('admits a model that exceeds the budget on its own rather than wedging forever', () => {
    expect(fits({ candidateMb: 9000, residentMb: [], budget: 5632 })).toBe(true);
  });

  it('refuses it as soon as anything else is resident', () => {
    expect(fits({ candidateMb: 9000, residentMb: [100], budget: 5632 })).toBe(false);
  });
});
