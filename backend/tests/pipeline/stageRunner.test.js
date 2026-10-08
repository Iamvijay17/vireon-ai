jest.mock('../../src/services/common/LoggerService', () => ({
  info: jest.fn(), warn: jest.fn(), error: jest.fn(), success: jest.fn(), debug: jest.fn(),
}));
jest.mock('../../src/services/pipeline/stageTracker', () => ({
  begin: jest.fn(),
  complete: jest.fn().mockResolvedValue(null),
  fail: jest.fn().mockResolvedValue(null),
  cancel: jest.fn().mockResolvedValue(null),
}));

const tracker = require('../../src/services/pipeline/stageTracker');
const { runStage } = require('../../src/services/pipeline/stageRunner');
const { StageTimeoutError, CODES } = require('../../src/services/pipeline/pipelineErrors');
const { JobCancelledError } = require('../../src/workers/videoWorker/shared');

const newCtx = () => ({ signal: new AbortController().signal });

beforeEach(() => {
  jest.clearAllMocks();
  tracker.begin.mockResolvedValue({ attempt: 1 });
});

describe('runStage - success', () => {
  it('records start then completion and returns the step result', async () => {
    const result = await runStage('audio', { jobId: 'j1', ctx: newCtx(), fn: async () => 42, timeoutMs: 0 });
    expect(result).toBe(42);
    expect(tracker.begin).toHaveBeenCalledWith('j1', 'audio');
    expect(tracker.complete).toHaveBeenCalledWith('j1', 'audio', expect.objectContaining({ reused: false, durationMs: expect.any(Number) }));
    expect(tracker.fail).not.toHaveBeenCalled();
  });

  it('reports reused when the step flagged that it found its output stored', async () => {
    const ctx = newCtx();
    await runStage('images', { jobId: 'j1', ctx, timeoutMs: 0, fn: async () => { ctx.reused = true; } });
    expect(tracker.complete).toHaveBeenCalledWith('j1', 'images', expect.objectContaining({ reused: true }));
  });

  it('does not leak one stage\'s reused flag into the next', async () => {
    const ctx = newCtx();
    await runStage('audio', { jobId: 'j1', ctx, timeoutMs: 0, fn: async () => { ctx.reused = true; } });
    await runStage('render', { jobId: 'j1', ctx, timeoutMs: 0, fn: async () => {} });
    expect(tracker.complete).toHaveBeenLastCalledWith('j1', 'render', expect.objectContaining({ reused: false }));
  });

  it('exposes the attempt number to the step', async () => {
    tracker.begin.mockResolvedValue({ attempt: 3 });
    const ctx = newCtx();
    await runStage('audio', { jobId: 'j1', ctx, timeoutMs: 0, fn: async () => {} });
    expect(ctx.attempt).toBe(3);
  });
});

describe('runStage - failure', () => {
  it('records a structured failure, attaches it to the error and rethrows the same error', async () => {
    const boom = new Error('TTS failed: no response');
    await expect(runStage('audio', { jobId: 'j1', ctx: newCtx(), timeoutMs: 0, fn: async () => { throw boom; } })).rejects.toBe(boom);

    expect(boom.structured).toMatchObject({ code: CODES.TTS_FAILED, stage: 'audio', retryable: true, attempt: 1 });
    expect(tracker.fail).toHaveBeenCalledWith('j1', 'audio', boom.structured, expect.objectContaining({ durationMs: expect.any(Number) }));
    expect(tracker.complete).not.toHaveBeenCalled();
  });

  it('marks a permanent failure non-retryable', async () => {
    const err = Object.assign(new Error('COMFYUI_CHECKPOINT is not set'), { permanent: true });
    await expect(runStage('images', { jobId: 'j1', ctx: newCtx(), timeoutMs: 0, fn: async () => { throw err; } })).rejects.toBe(err);
    expect(err.structured.retryable).toBe(false);
  });

  it('counts the attempt in the structured error', async () => {
    tracker.begin.mockResolvedValue({ attempt: 2 });
    const err = new Error('x');
    await expect(runStage('render', { jobId: 'j1', ctx: newCtx(), timeoutMs: 0, fn: async () => { throw err; } })).rejects.toBe(err);
    expect(err.structured.attempt).toBe(2);
  });
});

describe('runStage - cancellation', () => {
  it('records a cancelled stage, not a failure, and rethrows untouched', async () => {
    const cancelled = new JobCancelledError('j1');
    await expect(runStage('render', { jobId: 'j1', ctx: newCtx(), timeoutMs: 0, fn: async () => { throw cancelled; } })).rejects.toBe(cancelled);
    expect(tracker.cancel).toHaveBeenCalledWith('j1', 'render', expect.any(Object));
    expect(tracker.fail).not.toHaveBeenCalled();
    expect(cancelled.structured).toBeUndefined();
  });

  it('treats an AbortError the same way', async () => {
    const abort = Object.assign(new Error('aborted'), { name: 'AbortError' });
    await expect(runStage('audio', { jobId: 'j1', ctx: newCtx(), timeoutMs: 0, fn: async () => { throw abort; } })).rejects.toBe(abort);
    expect(tracker.cancel).toHaveBeenCalled();
    expect(tracker.fail).not.toHaveBeenCalled();
  });
});

describe('runStage - timeout', () => {
  it('fails a hung stage with a retryable STAGE_TIMEOUT and aborts its signal', async () => {
    const ctx = newCtx();
    let stageSignal;
    const hung = () => new Promise(() => {}); // never settles
    const run = runStage('render', {
      jobId: 'j1', ctx, timeoutMs: 20,
      fn: () => { stageSignal = ctx.signal; return hung(); },
    });

    await expect(run).rejects.toBeInstanceOf(StageTimeoutError);
    expect(stageSignal.aborted).toBe(true);
    const failure = tracker.fail.mock.calls[0][2];
    expect(failure).toMatchObject({ code: CODES.STAGE_TIMEOUT, stage: 'render', retryable: true });
    expect(tracker.cancel).not.toHaveBeenCalled();
  });

  it('reports a timeout even when the step unwinds from the abort with a cancellation error', async () => {
    const ctx = newCtx();
    const run = runStage('audio', {
      jobId: 'j1', ctx, timeoutMs: 20,
      fn: () => new Promise((_, reject) => {
        ctx.signal.addEventListener('abort', () => reject(new JobCancelledError('j1')));
      }),
    });
    await expect(run).rejects.toBeInstanceOf(StageTimeoutError);
    expect(tracker.cancel).not.toHaveBeenCalled();
    expect(tracker.fail).toHaveBeenCalled();
  });

  it('gives the step a signal that also fires on a user stop, and restores the original afterwards', async () => {
    const stop = new AbortController();
    const ctx = { signal: stop.signal };
    let stageSignal;
    const run = runStage('audio', {
      jobId: 'j1', ctx, timeoutMs: 10_000,
      fn: () => new Promise((_, reject) => {
        stageSignal = ctx.signal;
        stageSignal.addEventListener('abort', () => reject(new JobCancelledError('j1')));
      }),
    });
    await Promise.resolve();
    stop.abort();
    await expect(run).rejects.toBeInstanceOf(JobCancelledError);
    expect(stageSignal).not.toBe(stop.signal);
    expect(stageSignal.aborted).toBe(true);
    expect(ctx.signal).toBe(stop.signal);
    expect(tracker.cancel).toHaveBeenCalled();
  });

  it('a timeout of 0 disables the budget', async () => {
    const ctx = newCtx();
    const original = ctx.signal;
    await runStage('audio', { jobId: 'j1', ctx, timeoutMs: 0, fn: async () => { expect(ctx.signal).toBe(original); } });
    expect(tracker.complete).toHaveBeenCalled();
  });
});
