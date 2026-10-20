const config = require('../../config');
const tracker = require('./stageTracker');
const { createResourceSampler } = require('./resourceSampler');
const { StageTimeoutError, toStructuredError } = require('./pipelineErrors');

// One sampler per stage run; none when sampling is switched off.
const defaultSampler = () => {
  const { enabled, intervalMs } = config.pipeline.resourceSampling;
  return enabled ? createResourceSampler({ intervalMs }) : null;
};

const isCancellation = (err) => err?.cancelled === true || err?.name === 'AbortError';

/**
 * Run one pipeline stage with the guarantees the worker promises:
 *
 *   - observable   state is persisted at start, completion and failure
 *   - bounded      a stage over its time budget is aborted (its signal fires so
 *                  TTS/ComfyUI/Remotion calls stop) and fails as STAGE_TIMEOUT
 *   - structured   anything thrown leaves `err.structured` = { code, stage,
 *                  message, retryable, attempt, timestamp, detail } for the
 *                  retry policy and the UI
 *   - honest       a stage that found its output already stored reports
 *                  `reused` (steps set `ctx.reused = true` at their skip point)
 *
 * Cancellation is not a failure: it passes through untouched after the stage is
 * recorded as cancelled. The runner never swallows an error - the processor
 * still owns what happens next (retry, fail, rethrow).
 */
async function runStage(key, { jobId, ctx, fn, timeoutMs, createSampler = defaultSampler }) {
  const budget = timeoutMs ?? config.pipeline.stageTimeoutMs[key] ?? 0;
  const startedAt = Date.now();
  const { attempt } = await tracker.begin(jobId, key);
  const sampler = createSampler();
  sampler?.start();
  // Closing the sampler is bounded by one nvidia-smi timeout and can never throw.
  const resources = () => sampler?.stop().catch(() => null) ?? null;
  ctx.reused = false;
  ctx.attempt = attempt;

  const jobSignal = ctx.signal;
  const timeoutController = new AbortController();
  let timedOut = false;
  let timer;
  let timeoutRace = null;

  if (budget > 0) {
    // The step's own signal is the union of "user pressed Stop" and "budget
    // spent" - steps already turn an abort into a clean unwind.
    ctx.signal = jobSignal ? AbortSignal.any([jobSignal, timeoutController.signal]) : timeoutController.signal;
    timeoutRace = new Promise((_, reject) => {
      timer = setTimeout(() => {
        timedOut = true;
        timeoutController.abort();
        reject(new StageTimeoutError(key, budget));
      }, budget);
      // A pending budget timer must never keep a finished process alive.
      timer.unref?.();
    });
  }

  try {
    const result = await (timeoutRace ? Promise.race([fn(), timeoutRace]) : fn());
    const durationMs = Date.now() - startedAt;
    await tracker.complete(jobId, key, { durationMs, reused: Boolean(ctx.reused), resources: await resources() });
    return result;
  } catch (rawErr) {
    const durationMs = Date.now() - startedAt;
    // A step that unwinds from our own abort reports AbortError/cancelled - to
    // the caller that is a timeout, not a user cancellation.
    const err = timedOut && !(rawErr instanceof StageTimeoutError) ? new StageTimeoutError(key, budget) : rawErr;

    if (isCancellation(err)) {
      await tracker.cancel(jobId, key, { durationMs, resources: await resources() });
      throw err;
    }

    const structured = toStructuredError(err, { stage: key, attempt });
    try {
      err.structured = structured;
    } catch {
      // frozen/primitive error - the processor reclassifies from the message
    }
    await tracker.fail(jobId, key, structured, { durationMs, resources: await resources() });
    throw err;
  } finally {
    clearTimeout(timer);
    ctx.signal = jobSignal;
  }
}

module.exports = { runStage };
