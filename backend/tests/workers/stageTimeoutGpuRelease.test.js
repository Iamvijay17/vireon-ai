/**
 * Failure injection: a stage times out while its GPU callback is still working.
 *
 * Uses the real stage runner and the real GPU scheduler (fake model services). The question is
 * what the timeout leaves behind: the GPU slot and the task's dedupe key must come free, so the
 * stage's own retry can run instead of queueing behind - or being rejected as a duplicate of -
 * a callback nobody is waiting for any more.
 */
jest.mock('../../src/services/common/LoggerService', () => ({
  info: jest.fn(), warn: jest.fn(), error: jest.fn(), success: jest.fn(), debug: jest.fn(),
}));
jest.mock('../../src/services/pipeline/stageTracker', () => ({
  begin: jest.fn().mockResolvedValue({ attempt: 1 }),
  complete: jest.fn().mockResolvedValue(null),
  fail: jest.fn().mockResolvedValue(null),
  cancel: jest.fn().mockResolvedValue(null),
}));
const mockGetById = jest.fn();
jest.mock('../../src/services/video/VideoService', () => ({ getById: (...a) => mockGetById(...a) }));

const config = require('../../src/config');
const { GPUResourceManager } = require('../../src/services/localAI/gpuResourceManager');
const { GpuScheduler } = require('../../src/services/gpu/GpuScheduler');
const { DuplicateGpuTaskError } = require('../../src/services/gpu/gpuErrors');
const { runStage } = require('../../src/services/pipeline/stageRunner');
const { StageTimeoutError } = require('../../src/services/pipeline/pipelineErrors');
const { checkpoint, JobCancelledError } = require('../../src/workers/videoWorker/shared');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function makeProcess() {
  config.gpu.maxConcurrent = 1;
  const gpu = new GPUResourceManager({ lease: null });
  for (const name of ['llm', 'tts', 'comfyui']) {
    gpu.register(name, { ensureRunning: jest.fn(async () => {}), unload: jest.fn(async () => {}), stop: jest.fn(async () => {}) }, { autoStop: false });
  }
  const settings = {
    scheduler: { priorityWeightMs: 1000, affinityWindowMs: 0, taskRetries: 0, taskRetryBaseMs: 1, ticketTtlMs: 200, leasePollMs: 2 },
    vram: { admission: true, totalMb: 6144, reserveMb: 512, liveCheck: false, liveFactor: 0.8, pollMs: 2, admissionTimeoutMs: 40, estimateMb: { llm: 5000, tts: 5000, comfyui: 5000 } },
    breaker: { threshold: 3, cooldownMs: 50, maxCooldownMs: 200 },
  };
  const scheduler = new GpuScheduler({ gpu, settings, maxConcurrent: 1 });
  gpu.attachScheduler(scheduler);
  gpu.testScheduler = scheduler;
  return gpu;
}

const originalMax = config.gpu.maxConcurrent;
afterAll(() => { config.gpu.maxConcurrent = originalMax; });
beforeEach(() => { mockGetById.mockReset().mockResolvedValue({ status: 'SCRIPT_GENERATION' }); });

/**
 * A director-like callback: units of 10 ms work, calling `check` between units, for up to `units`.
 * Records how many units ran so a test can see whether it kept working after the timeout.
 */
const directorLike = (check, progress, units = 40) => async () => {
  for (let i = 0; i < units; i += 1) {
    await check();
    await sleep(10);
    progress.units += 1;
  }
  return 'script';
};

const scriptStage = (gpu, ctx, check, progress) => runStage('script', {
  jobId: 'job-1',
  ctx,
  timeoutMs: 60,
  // The signal is captured when the callback is created: runStage puts ctx.signal back to the
  // job's own signal in its `finally`, so a callback that read ctx.signal lazily would see an
  // un-aborted signal after the timeout and never stop.
  fn: () => {
    const signal = ctx.signal;
    return gpu.withGPU('llm', directorLike(() => check(signal), progress), { jobId: 'job-1', stage: 'script', signal });
  },
});

describe('a stage that times out while its GPU callback is running', () => {
  it('CONTROL: a callback that ignores the abort keeps the slot, so the retry is rejected as a duplicate', async () => {
    const gpu = makeProcess();
    const progress = { units: 0 };
    await expect(scriptStage(gpu, { signal: new AbortController().signal }, async () => {}, progress)).rejects.toBeInstanceOf(StageTimeoutError);

    // The stage has failed, but its callback is still generating on the GPU...
    const before = progress.units;
    await sleep(60);
    expect(progress.units).toBeGreaterThan(before);
    // ...so the stage's retry cannot start.
    await expect(gpu.withGPU('llm', async () => 'retry', { jobId: 'job-1', stage: 'script' })).rejects.toBeInstanceOf(DuplicateGpuTaskError);
  });

  it('a callback that checks the stage signal stops, frees the slot, and the retry runs', async () => {
    const gpu = makeProcess();
    const progress = { units: 0 };
    await expect(scriptStage(gpu, { signal: new AbortController().signal }, (signal) => checkpoint('job-1', signal), progress)).rejects.toBeInstanceOf(StageTimeoutError);

    // It notices the abort at its next checkpoint (one unit later) and unwinds.
    await sleep(40);
    const settled = progress.units;
    await sleep(60);
    expect(progress.units).toBe(settled); // stopped working

    expect(await gpu.withGPU('llm', async () => 'retry', { jobId: 'job-1', stage: 'script' })).toBe('retry');
    expect(gpu.testScheduler.running.size).toBe(0);
  });

  it('a user Stop still surfaces as a cancellation, not a bare abort', async () => {
    mockGetById.mockResolvedValue({ status: 'CANCELLED' });
    await expect(checkpoint('job-1', new AbortController().signal)).rejects.toBeInstanceOf(JobCancelledError);
  });

  it('does nothing while the job is live and the signal is quiet', async () => {
    await expect(checkpoint('job-1', new AbortController().signal)).resolves.toBeUndefined();
    await expect(checkpoint('job-1', undefined)).resolves.toBeUndefined();
  });
});
