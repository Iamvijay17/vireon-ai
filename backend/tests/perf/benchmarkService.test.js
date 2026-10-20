jest.mock('../../src/models/PerfBenchmark', () => ({ find: jest.fn(), findById: jest.fn() }));

const PerfBenchmark = require('../../src/models/PerfBenchmark');
const service = require('../../src/services/perf/benchmarkService');

const run = (id, extra = {}) => ({
  _id: id, label: id, status: 'COMPLETED', totalMs: 1000, workload: { scenes: 4, audioSeconds: 100 },
  stages: { audio: { status: 'completed', durationMs: 800, attempt: 1, reused: false, resources: null } },
  ...extra,
});
const chain = (rows) => ({ sort: () => ({ limit: (n) => ({ lean: () => Promise.resolve(rows.slice(0, n)) }) }) });

beforeEach(() => jest.clearAllMocks());

describe('benchmarkService', () => {
  it('lists runs with a bottleneck explanation derived from their own stages', async () => {
    PerfBenchmark.find.mockReturnValue(chain([run('a'), run('b')]));
    const rows = await service.list({ limit: 1 });
    expect(rows).toHaveLength(1);
    expect(rows[0].bottleneck.stage).toBe('audio');
    expect(rows[0].peak).toEqual({ vram: null, ram: null });
  });

  it('clamps an absurd limit', async () => {
    PerfBenchmark.find.mockReturnValue(chain([]));
    await expect(service.list({ limit: 100000 })).resolves.toEqual([]);
  });

  it('compares two stored runs', async () => {
    PerfBenchmark.findById.mockImplementation((id) => ({ lean: () => Promise.resolve(run(id, id === 'bbbbbbbbbbbbbbbbbbbbbbbb' ? { totalMs: 500 } : {})) }));
    const out = await service.compare('aaaaaaaaaaaaaaaaaaaaaaaa', 'bbbbbbbbbbbbbbbbbbbbbbbb');
    expect(out.comparison.totalDeltaPct).toBe(-50);
    expect(out.before.id).toBe('aaaaaaaaaaaaaaaaaaaaaaaa');
  });

  it('rejects a missing or malformed id with a validation error instead of a cast crash', async () => {
    await expect(service.compare(undefined, 'bbbbbbbbbbbbbbbbbbbbbbbb')).rejects.toThrow(/benchmark run ids/);
    await expect(service.compare('not-an-id', 'bbbbbbbbbbbbbbbbbbbbbbbb')).rejects.toThrow(/benchmark run ids/);
    expect(PerfBenchmark.findById).not.toHaveBeenCalled();
  });

  it('reports a run that does not exist', async () => {
    PerfBenchmark.findById.mockReturnValue({ lean: () => Promise.resolve(null) });
    await expect(service.compare('aaaaaaaaaaaaaaaaaaaaaaaa', 'bbbbbbbbbbbbbbbbbbbbbbbb')).rejects.toThrow(/not found/);
  });
});
