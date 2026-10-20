const { rankStages, activeMs, findBottleneck, peakResources, compareRuns } = require('../../src/services/perf/benchmarkAnalysis');
const { buildRecord, cacheDelta } = require('../../src/services/perf/benchmarkRecorder');

const vram = (peak) => ({ startUsedMb: 760, peakUsedMb: peak, minFreeMb: 6144 - peak, totalMb: 6144, reads: 5 });
const stages = {
  script: { status: 'completed', durationMs: 60_000, attempt: 1, reused: false, resources: null },
  audio: { status: 'completed', durationMs: 480_000, attempt: 1, reused: false, resources: { vram: vram(5400), ram: { peakUsedMb: 9000, minFreeMb: 7000, totalMb: 16000 }, cpu: { peakPct: 40, avgPct: 22 } } },
  images: { status: 'completed', durationMs: 0, attempt: 1, reused: true, resources: null },
  assets: { status: 'completed', durationMs: 12_000, attempt: 1, reused: false, resources: null },
  render: { status: 'completed', durationMs: 240_000, attempt: 1, reused: false, resources: { vram: null, ram: { peakUsedMb: 12000, minFreeMb: 4000, totalMb: 16000 }, cpu: { peakPct: 98, avgPct: 91 } } },
  upload: { status: 'completed', durationMs: 3_000, attempt: 1, reused: false, resources: null },
};

describe('rankStages', () => {
  it('orders worked stages slowest first with shares of the active total, and leaves out reused stages', () => {
    const ranked = rankStages(stages);
    expect(ranked.map((s) => s.key)).toEqual(['audio', 'render', 'script', 'assets', 'upload']);
    expect(ranked.find((s) => s.key === 'images')).toBeUndefined();
    expect(ranked[0].sharePct).toBeCloseTo((480 / 795) * 100, 0);
    expect(ranked.reduce((n, s) => n + s.sharePct, 0)).toBeCloseTo(100, 0);
    expect(activeMs(stages)).toBe(795_000);
  });

  it('ignores stages with no recorded duration instead of counting them as zero', () => {
    expect(rankStages({ audio: { status: 'running', durationMs: null } })).toEqual([]);
    expect(rankStages(undefined)).toEqual([]);
  });
});

describe('findBottleneck', () => {
  it('names the slowest stage and quotes only measured facts', () => {
    const b = findBottleneck(stages, { scenes: 4, audioSeconds: 120 });
    expect(b.stage).toBe('audio');
    expect(b.facts.join(' ')).toMatch(/peaked at 5400 of 6144 MiB/);
    expect(b.facts.join(' ')).toMatch(/4\.00x real time/);
    expect(b.nextExperiment).toMatch(/TTS cache/);
  });

  it('says GPU memory was not measured rather than inventing a figure', () => {
    const noVram = { audio: { ...stages.audio, resources: { vram: null, ram: null, cpu: null } } };
    expect(findBottleneck(noVram).facts.join(' ')).toMatch(/not measured/);
  });

  it('advises against more render concurrency when the CPU is already saturated', () => {
    const b = findBottleneck({ render: stages.render });
    expect(b.stage).toBe('render');
    expect(b.nextExperiment).toMatch(/will not help/);
  });

  it('reports honestly when nothing did work', () => {
    const b = findBottleneck({ audio: { durationMs: 5, reused: true } });
    expect(b.stage).toBeNull();
    expect(b.explanation).toMatch(/No stage did measurable work/);
  });

  it('flags retries because they inflate a stage', () => {
    const b = findBottleneck({ audio: { ...stages.audio, attempt: 3 } });
    expect(b.facts.join(' ')).toMatch(/ran 3 times/);
  });
});

describe('peakResources', () => {
  it('finds the stage with the highest VRAM and RAM peak, null when never measured', () => {
    const p = peakResources(stages);
    expect(p.vram).toMatchObject({ peakUsedMb: 5400, stage: 'audio' });
    expect(p.ram).toMatchObject({ peakUsedMb: 12000, stage: 'render' });
    expect(peakResources({ audio: { durationMs: 1 } })).toEqual({ vram: null, ram: null });
  });
});

describe('compareRuns', () => {
  const before = { totalMs: 1_000_000, workload: { scenes: 4 }, stages };
  const faster = { totalMs: 800_000, workload: { scenes: 4 }, stages: { ...stages, audio: { ...stages.audio, durationMs: 300_000 } } };

  it('reports per-stage and total change for comparable workloads', () => {
    const c = compareRuns(before, faster);
    expect(c.comparable).toBe(true);
    expect(c.caveat).toBeNull();
    expect(c.totalDeltaPct).toBe(-20);
    const audio = c.rows.find((r) => r.key === 'audio');
    expect(audio).toMatchObject({ beforeMs: 480_000, afterMs: 300_000, deltaPct: -37.5, beforePerSceneMs: 120_000, afterPerSceneMs: 75_000 });
  });

  it('refuses to call runs comparable when the amount of work differs a lot, and normalises per scene', () => {
    const c = compareRuns(before, { totalMs: 1_500_000, workload: { scenes: 8 }, stages });
    expect(c.comparable).toBe(false);
    expect(c.caveat).toMatch(/different amounts of work/);
    expect(c.totalDeltaPct).toBe(50);
    expect(c.perSceneDeltaPct).toBe(-25);
  });

  it('gives null, not zero, for a stage that did not work in one of the runs', () => {
    const c = compareRuns(before, { ...faster, stages: { ...faster.stages, render: { ...stages.render, reused: true } } });
    const render = c.rows.find((r) => r.key === 'render');
    expect(render.afterMs).toBeNull();
    expect(render.deltaMs).toBeNull();
  });

  it('is not comparable when the scene count is unknown', () => {
    expect(compareRuns({ totalMs: 1, stages }, { totalMs: 1, stages }).comparable).toBe(false);
  });
});

describe('cacheDelta', () => {
  it('reports the change per kind with a hit rate, and drops kinds that did not move', () => {
    const before = { tts: { hits: 10, misses: 5, shared: 0 }, image: { hits: 1, misses: 1, shared: 0 } };
    const after = { tts: { hits: 13, misses: 6, shared: 0 }, image: { hits: 1, misses: 1, shared: 0 } };
    expect(cacheDelta(before, after)).toEqual({ tts: { hits: 3, misses: 1, shared: 0, hitRatePct: 75 } });
  });

  it('is null when either read failed', () => {
    expect(cacheDelta(null, {})).toBeNull();
    expect(cacheDelta({}, null)).toBeNull();
  });
});

describe('buildRecord', () => {
  const job = {
    _id: 'job-abc',
    status: 'COMPLETED',
    type: 'educational',
    resolution: '1920x1080',
    quality: 'standard',
    topic: 'tides',
    script: { scenes: [{ audio: { duration: 30.04 }, imageUrl: 'x' }, { audio: { duration: 29.96 } }] },
    stages: { audio: { status: 'completed', durationMs: 1000, attempt: 1, reused: false, resources: { vram: vram(4000) } } },
    statusHistory: [{ from: 'QUEUED', to: 'SCRIPT_GENERATION', timestamp: new Date('2026-10-20T10:00:05Z') }],
    qualityReport: { status: 'passed', passed: true, summary: { errors: 0, warnings: 1 } },
  };

  it('assembles the stored record from a finished job without inventing anything', () => {
    const r = buildRecord({
      job, submittedAt: new Date('2026-10-20T10:00:00Z'), finishedAt: new Date('2026-10-20T10:20:00Z'),
      hardware: { gpu: null }, versions: { node: 'v24' }, cacheBefore: null, cacheAfter: null, label: 'x',
    });
    expect(r).toMatchObject({ jobId: 'job-abc', status: 'COMPLETED', totalMs: 1_200_000, queueWaitMs: 5000, cache: null });
    expect(r.workload).toMatchObject({ scenes: 2, audioSeconds: 60, images: 1 });
    expect(r.stages.audio.resources.vram.peakUsedMb).toBe(4000);
    expect(r.validation).toEqual({ status: 'passed', passed: true, summary: { errors: 0, warnings: 1 } });
    expect(r.ranking).toEqual([{ key: 'audio', durationMs: 1000, sharePct: 100 }]);
  });

  it('records a missing quality report as null, and a failure with its message', () => {
    const r = buildRecord({ job: { ...job, qualityReport: null, status: 'FAILED', error: { message: 'TTS down', step: 'GENERATING_AUDIO' } }, submittedAt: new Date(0), finishedAt: new Date(1000), hardware: null, versions: null });
    expect(r.validation).toBeNull();
    expect(r.error).toEqual({ message: 'TTS down', step: 'GENERATING_AUDIO' });
  });
});
