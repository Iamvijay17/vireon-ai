jest.mock('../../src/services/common/LoggerService', () => ({
  info: jest.fn(), warn: jest.fn(), error: jest.fn(), success: jest.fn(), debug: jest.fn(),
}));
jest.mock('../../src/models/VideoJob', () => ({ aggregate: jest.fn(), estimatedDocumentCount: jest.fn() }));
jest.mock('../../src/models/JobEvent', () => ({ JobEvent: { aggregate: jest.fn() }, JobEventCounter: {} }));
jest.mock('../../src/services/common/MetricsService', () => ({ getAverage: jest.fn(), getRate: jest.fn() }));
jest.mock('../../src/services/cache/CacheLedger', () => ({ stats: jest.fn() }));

const VideoJob = require('../../src/models/VideoJob');
const { JobEvent } = require('../../src/models/JobEvent');
const MetricsService = require('../../src/services/common/MetricsService');
const CacheLedger = require('../../src/services/cache/CacheLedger');
const ControlCenter = require('../../src/services/common/ControlCenterService');

const { pipelines, shape } = ControlCenter;
const since = new Date('2026-09-01T00:00:00Z');

describe('pipelines ask Mongo for exactly the windowed, persisted data', () => {
  it('every VideoJob pipeline is bounded to the requested window', () => {
    for (const [name, build] of Object.entries({
      videoStatus: pipelines.videoStatusPipeline,
      stageTiming: pipelines.stageTimingPipeline,
      stageData: pipelines.jobsWithStageDataPipeline,
      failedErrors: pipelines.failedJobErrorPipeline,
      retries: pipelines.retryPipeline,
    })) {
      const match = build(since)[0].$match;
      expect(JSON.stringify(match)).toContain(since.toISOString().slice(0, 10)); // the date made it in
      expect(name).toBeTruthy();
    }
  });

  it('stage timing counts only real timed work: completed, not reused, with a duration', () => {
    const group = pipelines.stageTimingPipeline(since).find((s) => s.$group).$group;
    const text = JSON.stringify(group.totalMs);
    expect(text).toContain('completed');
    expect(text).toContain('reused');
    expect(text).toContain('durationMs');
    expect(group._id).toBe('$stages.k');
  });

  it('only looks at jobs that carry stage state', () => {
    expect(pipelines.stageTimingPipeline(since)[0].$match.stages).toEqual({ $type: 'object' });
  });

  it('reads the stage stream by event type and time (the indexed fields)', () => {
    for (const build of [pipelines.stageEventPipeline, pipelines.topErrorPipeline]) {
      const match = build(since)[0].$match;
      expect(match.type).toBe('stageUpdate');
      expect(match.at).toEqual({ $gte: since });
    }
    expect(pipelines.topErrorPipeline(since)[0].$match['data.status']).toBe('failed');
  });

  it('top errors are ranked by how often they happen and capped', () => {
    const p = pipelines.topErrorPipeline(since, 5);
    expect(p.find((s) => s.$sort && s.$sort.count)).toBeTruthy();
    expect(p.find((s) => s.$limit).$limit).toBe(5);
  });

  it('generation time is measured from time spent in ACTIVE statuses, not wall clock', () => {
    const text = JSON.stringify(pipelines.generationTimePipeline(since, ['RENDERING', 'GENERATING_AUDIO']));
    expect(text).toContain('RENDERING');
    expect(text).toContain('statusHistory');
    expect(text).not.toContain('createdAt');
  });
});

describe('shapeVideos', () => {
  const rows = [
    { _id: 'COMPLETED', count: 13 }, { _id: 'FAILED', count: 2 }, { _id: 'CANCELLED', count: 1 },
    { _id: 'RENDERING', count: 2 }, { _id: 'RETRY_SCHEDULED', count: 1 }, { _id: 'AWAITING_APPROVAL', count: 3 }, { _id: 'AUDIO_COMPLETED', count: 1 },
  ];

  it('separates successful, failed, cancelled and processing', () => {
    const v = shape.shapeVideos(rows, 40);
    expect(v).toMatchObject({ total: 23, allTime: 40, successful: 13, failed: 2, cancelled: 1 });
    expect(v.processing).toBe(4); // rendering x2, retry scheduled, audio completed
  });

  it('counts videos waiting on a person separately - they are not "processing"', () => {
    expect(shape.shapeVideos(rows, 40).awaitingPerson).toBe(3);
  });

  it('the success rate is over videos that reached an end state only', () => {
    expect(shape.shapeVideos(rows, 40).successRate).toBe(81.3); // 13 / (13 + 2 + 1)
  });

  it('has no success rate - null, not 0 - when nothing has finished', () => {
    expect(shape.shapeVideos([{ _id: 'RENDERING', count: 2 }], 2).successRate).toBeNull();
    expect(shape.shapeVideos([], 0)).toMatchObject({ total: 0, successful: 0, successRate: null });
  });
});

describe('shapePipeline', () => {
  const stageRows = [
    { _id: 'audio', jobs: 6, completed: 6, reused: 1, timedRuns: 5, totalMs: 500_000, maxMs: 180_000 },
    { _id: 'render', jobs: 6, completed: 5, reused: 0, timedRuns: 5, totalMs: 1_000_000, maxMs: 300_000 },
  ];

  it('lists every stage in pipeline order, with averages from timed runs only', () => {
    const p = shape.shapePipeline({ stageRows, generationRows: [], stageDataRows: [{ _id: 'with', count: 6 }], queueWaitMs: 2500 });
    expect(p.stages.map((s) => s.key)).toEqual(['script', 'audio', 'images', 'assets', 'render', 'upload']);
    const audio = p.stages.find((s) => s.key === 'audio');
    expect(audio).toMatchObject({ jobs: 6, reused: 1, timedRuns: 5, avgMs: 100_000, maxMs: 180_000 });
    // the reused run did no work, so it is not averaged in as a fast one
    expect(p.stages.find((s) => s.key === 'render').avgMs).toBe(200_000);
  });

  it('a stage nobody has run has a null average, not zero', () => {
    const p = shape.shapePipeline({ stageRows, generationRows: [], stageDataRows: [], queueWaitMs: null });
    expect(p.stages.find((s) => s.key === 'script')).toMatchObject({ jobs: 0, avgMs: null, maxMs: null });
  });

  it('reports how many jobs predate stage tracking instead of guessing their timing', () => {
    const p = shape.shapePipeline({ stageRows: [], generationRows: [], stageDataRows: [{ _id: 'with', count: 4 }, { _id: 'without', count: 15 }], queueWaitMs: null });
    expect(p).toMatchObject({ jobsWithStageData: 4, jobsWithoutStageData: 15 });
  });

  it('carries the average generation time with its sample size, and the queue wait', () => {
    const p = shape.shapePipeline({ stageRows: [], generationRows: [{ avgMs: 950_047.4, jobs: 13 }], stageDataRows: [], queueWaitMs: 21_535.2 });
    expect(p).toMatchObject({ avgGenerationMs: 950_047, generationSampleSize: 13, avgQueueWaitMs: 21_535 });
  });

  it('has nothing to say about generation time with no completed jobs', () => {
    const p = shape.shapePipeline({ stageRows: [], generationRows: [], stageDataRows: [], queueWaitMs: null });
    expect(p).toMatchObject({ avgGenerationMs: null, generationSampleSize: 0, avgQueueWaitMs: null });
  });
});

describe('shapeFailures', () => {
  const eventRows = [
    { _id: { stage: 'audio', status: 'running' }, count: 8, retries: 2 },
    { _id: { stage: 'audio', status: 'completed' }, count: 6 },
    { _id: { stage: 'audio', status: 'failed' }, count: 2 },
    { _id: { stage: 'render', status: 'running' }, count: 6, retries: 0 },
    { _id: { stage: 'render', status: 'completed' }, count: 6 },
    { _id: { stage: 'script', status: 'cancelled' }, count: 1 },
    { _id: { stage: null, status: 'running' }, count: 99, retries: 0 },
  ];
  const base = { eventRows, topErrorRows: [], jobErrorRows: [], retryRows: [], totalJobs: 20 };

  it('computes the failure rate of each stage over attempts that reached a result', () => {
    const f = shape.shapeFailures(base);
    const audio = f.byStage.find((s) => s.stage === 'audio');
    expect(audio).toMatchObject({ attempts: 8, failures: 2, retries: 2, failureRate: 25 }); // 2 / (6 + 2)
    expect(f.byStage.find((s) => s.stage === 'render')).toMatchObject({ attempts: 6, failures: 0, failureRate: 0 });
  });

  it('a stage with no results yet has a null rate, not 0%', () => {
    const f = shape.shapeFailures(base);
    expect(f.byStage.find((s) => s.stage === 'upload')).toMatchObject({ attempts: 0, failureRate: null });
    // a cancelled stage is neither a success nor a failure
    expect(f.byStage.find((s) => s.stage === 'script')).toMatchObject({ failures: 0, failureRate: null });
  });

  it('ignores events with no stage', () => {
    expect(shape.shapeFailures(base).byStage.reduce((n, s) => n + s.attempts, 0)).toBe(14);
  });

  it('lists top errors with the code, stage, count and the last user-facing message', () => {
    const f = shape.shapeFailures({
      ...base,
      topErrorRows: [{ _id: { code: 'TTS_FAILED', stage: 'audio' }, count: 3, message: 'Voice generation failed', retryable: true, lastAt: new Date('2026-09-02') }],
    });
    expect(f.topErrors[0]).toMatchObject({ code: 'TTS_FAILED', stage: 'audio', count: 3, message: 'Voice generation failed', retryable: true });
  });

  it('names an error with no code UNKNOWN rather than dropping it', () => {
    const f = shape.shapeFailures({ ...base, topErrorRows: [{ _id: { code: null, stage: 'render' }, count: 1 }] });
    expect(f.topErrors[0].code).toBe('UNKNOWN');
  });

  it('counts failed jobs by code, covering jobs that predate the event stream', () => {
    const f = shape.shapeFailures({ ...base, jobErrorRows: [{ _id: 'RENDER_FAILED', count: 2 }, { _id: 'RENDERING', count: 1 }] });
    expect(f.failedJobsByCode).toEqual([{ code: 'RENDER_FAILED', count: 2 }, { code: 'RENDERING', count: 1 }]);
  });

  it('computes retries per retried job and per job', () => {
    const f = shape.shapeFailures({ ...base, retryRows: [{ jobs: 4, retries: 10 }] });
    expect(f.retries).toEqual({ totalRetries: 10, retriedJobs: 4, avgRetriesPerRetriedJob: 2.5, avgRetriesPerJob: 0.5, retryRate: 20 });
  });

  it('has no retry averages when nothing was retried or there are no jobs', () => {
    expect(shape.shapeFailures(base).retries).toMatchObject({ totalRetries: 0, retriedJobs: 0, avgRetriesPerRetriedJob: null, retryRate: 0 });
    expect(shape.shapeFailures({ ...base, totalJobs: 0 }).retries).toMatchObject({ avgRetriesPerJob: null, retryRate: null });
  });
});

describe('shapeQueue', () => {
  it('reports depth as work asked for and not started (waiting + delayed)', () => {
    expect(shape.shapeQueue({ waiting: 3, delayed: 2, active: 1, completed: 40, failed: 4 }, 1, 1)).toEqual({
      concurrency: 1, workersOnline: 1, waiting: 3, delayed: 2, depth: 5, active: 1, completed: 40, failed: 4,
    });
  });
  it('treats missing counts as zero', () => {
    expect(shape.shapeQueue({}, 0, 1)).toMatchObject({ depth: 0, active: 0, workersOnline: 0 });
  });
});

describe('getControlCenter', () => {
  const queue = (counts = { waiting: 1, delayed: 0, active: 1, completed: 9, failed: 0 }, workers = [{}]) => ({
    getJobCounts: jest.fn().mockResolvedValue(counts),
    getWorkers: jest.fn().mockResolvedValue(workers),
  });

  beforeEach(() => {
    jest.clearAllMocks();
    // route each aggregate by what it groups on
    VideoJob.estimatedDocumentCount.mockResolvedValue(30);
    VideoJob.aggregate.mockImplementation(async (pipeline) => {
      const text = JSON.stringify(pipeline);
      if (text.includes('$objectToArray')) return [{ _id: 'render', jobs: 3, completed: 3, reused: 0, timedRuns: 3, totalMs: 600000, maxMs: 300000 }];
      if (text.includes('"with"')) return [{ _id: 'with', count: 3 }, { _id: 'without', count: 7 }];
      if (text.includes('activeMs')) return [{ avgMs: 120000, jobs: 5 }];
      if (text.includes('RETRY_SCHEDULED') && text.includes('retries')) return [{ jobs: 1, retries: 2 }];
      if (text.includes('error.code')) return [{ _id: 'RENDER_FAILED', count: 1 }];
      return [{ _id: 'COMPLETED', count: 8 }, { _id: 'FAILED', count: 1 }, { _id: 'RENDERING', count: 1 }];
    });
    JobEvent.aggregate.mockImplementation(async (pipeline) => (
      JSON.stringify(pipeline).includes('$last')
        ? [{ _id: { code: 'RENDER_FAILED', stage: 'render' }, count: 1, message: 'Video rendering failed', retryable: true }]
        : [{ _id: { stage: 'render', status: 'running' }, count: 4, retries: 1 }, { _id: { stage: 'render', status: 'completed' }, count: 3 }, { _id: { stage: 'render', status: 'failed' }, count: 1 }]
    ));
    MetricsService.getAverage.mockResolvedValue(3000);
    MetricsService.getRate.mockResolvedValue(14.2);
    CacheLedger.stats.mockResolvedValue({ days: 30, byKind: [{ kind: 'image', hits: 3, misses: 1 }], total: { hits: 3, misses: 1, hitRate: 75, timeSavedMs: 900000 } });
  });

  it('assembles videos, pipeline, cache, failures and workers from the persisted sources', async () => {
    const out = await ControlCenter.getControlCenter({ days: 30, queues: () => ({ video: queue(), course: queue() }) });

    expect(out.range.days).toBe(30);
    expect(out.videos).toMatchObject({ total: 10, allTime: 30, successful: 8, failed: 1, processing: 1 });
    expect(out.pipeline).toMatchObject({ avgGenerationMs: 120000, avgQueueWaitMs: 3000, jobsWithStageData: 3, jobsWithoutStageData: 7 });
    expect(out.pipeline.stages.find((s) => s.key === 'render').avgMs).toBe(200000);
    expect(out.cache).toMatchObject({ total: { hitRate: 75, timeSavedMs: 900000 }, legacyTtsHitRate: 14.2 });
    expect(out.failures.byStage.find((s) => s.stage === 'render')).toMatchObject({ attempts: 4, failures: 1, failureRate: 25 });
    expect(out.failures.topErrors[0]).toMatchObject({ code: 'RENDER_FAILED', count: 1 });
    expect(out.failures.retries.totalRetries).toBe(2);
    expect(out.workers.video).toMatchObject({ available: true, depth: 1, active: 1, completed: 9, workersOnline: 1 });
  });

  it('asks the cache ledger for the same window', async () => {
    await ControlCenter.getControlCenter({ days: 7, queues: () => ({ video: queue(), course: queue() }) });
    expect(CacheLedger.stats).toHaveBeenCalledWith({ days: 7 });
  });

  it('says a queue is unavailable instead of showing an empty, healthy-looking one', async () => {
    const down = { getJobCounts: jest.fn().mockRejectedValue(new Error('redis down')), getWorkers: jest.fn().mockRejectedValue(new Error('redis down')) };
    const out = await ControlCenter.getControlCenter({ queues: () => ({ video: down, course: queue() }) });
    expect(out.workers.video).toEqual({ available: false });
    expect(out.workers.course.available).toBe(true);
  });

  it('survives the queue module itself failing to load', async () => {
    const out = await ControlCenter.getControlCenter({ queues: () => { throw new Error('no redis'); } });
    expect(out.workers).toEqual({ video: { available: false }, course: { available: false } });
    expect(out.videos.total).toBe(10);
  });

  it('works with a brand-new install: no data anywhere', async () => {
    VideoJob.aggregate.mockResolvedValue([]);
    VideoJob.estimatedDocumentCount.mockResolvedValue(0);
    JobEvent.aggregate.mockResolvedValue([]);
    MetricsService.getAverage.mockResolvedValue(null);
    MetricsService.getRate.mockResolvedValue(null);
    CacheLedger.stats.mockResolvedValue({ days: 30, byKind: [], total: { hits: 0, misses: 0, hitRate: null, timeSavedMs: 0 } });
    const out = await ControlCenter.getControlCenter({ queues: () => ({ video: queue(), course: queue() }) });
    expect(out.videos).toMatchObject({ total: 0, successRate: null });
    expect(out.pipeline).toMatchObject({ avgGenerationMs: null, avgQueueWaitMs: null });
    expect(out.failures.byStage.every((s) => s.failureRate === null)).toBe(true);
  });
});
