const mongoose = require('mongoose');
const VideoJob = require('../../models/VideoJob');
const LoggerService = require('../common/LoggerService');
const { STAGE_STATE, STAGE_ORDER, DOWNSTREAM, isStageKey } = require('./stages');
const { publicError } = require('./pipelineErrors');

/**
 * Persists each worker stage's state onto `VideoJob.stages.<key>`:
 *
 *   { status, startedAt, completedAt, durationMs, attempt, reused, error }
 *
 * Every write is a single atomic $set/$inc, and every method is best-effort:
 * stage state is an observability + resume record, so a Mongo hiccup is logged
 * and swallowed rather than failing the render it describes (same contract as
 * JobEventService). Each transition is also emitted as a `stageUpdate` event so
 * the UI follows stages live and a reconnecting client replays them.
 */

const path = (key, field) => `stages.${key}.${field}`;

// Not connected (a reconnect gap, a process that never connected): Mongoose would buffer the
// write for ten seconds before failing it, and the pipeline awaits these calls. Stage state is
// an observability record, so it is skipped rather than stalling the stage it describes -
// the same rule JobEventService applies.
const connected = () => mongoose.connection.readyState === 1;

function emit(jobId, key, stage) {
  try {
    // Required lazily: SocketService opens its Redis bridge on load, and the
    // tracker is imported by lifecycle code that must stay cheap to load.
    require('../common/SocketService').emitStageUpdate(jobId, key, stage);
  } catch (err) {
    LoggerService.warn('[Stage] failed to emit stage update', { jobId, stage: key, error: err.message });
  }
}

async function write(jobId, key, update, label) {
  if (!connected()) return null;
  try {
    const job = await VideoJob.findByIdAndUpdate(jobId, update, { new: true }).select(`stages.${key}`).lean();
    return job?.stages?.[key] || null;
  } catch (err) {
    LoggerService.warn(`[Stage] could not record ${label}`, { jobId, stage: key, error: err.message });
    return null;
  }
}

/** Mark a stage running and count the attempt. Returns { attempt }. */
async function begin(jobId, key) {
  const stage = await write(jobId, key, {
    $set: {
      [path(key, 'status')]: STAGE_STATE.RUNNING,
      [path(key, 'startedAt')]: new Date(),
      [path(key, 'completedAt')]: null,
      [path(key, 'durationMs')]: null,
      [path(key, 'reused')]: false,
      [path(key, 'error')]: null,
    },
    $inc: { [path(key, 'attempt')]: 1 },
  }, 'stage start');

  const attempt = stage?.attempt || 1;
  LoggerService.info('[Stage] started', { jobId, stage: key, attempt });
  if (stage) emit(jobId, key, stage);
  return { attempt };
}

async function complete(jobId, key, { durationMs, reused = false } = {}) {
  const stage = await write(jobId, key, {
    $set: {
      [path(key, 'status')]: STAGE_STATE.COMPLETED,
      [path(key, 'completedAt')]: new Date(),
      [path(key, 'durationMs')]: durationMs ?? null,
      [path(key, 'reused')]: reused,
      [path(key, 'error')]: null,
    },
  }, 'stage completion');
  LoggerService.info(reused ? '[Stage] reused stored output' : '[Stage] completed', { jobId, stage: key, durationMs, reused });
  if (stage) emit(jobId, key, stage);
  return stage;
}

async function fail(jobId, key, error, { durationMs } = {}) {
  const stage = await write(jobId, key, {
    $set: {
      [path(key, 'status')]: STAGE_STATE.FAILED,
      [path(key, 'completedAt')]: new Date(),
      [path(key, 'durationMs')]: durationMs ?? null,
      [path(key, 'error')]: publicError(error),
    },
  }, 'stage failure');
  LoggerService.error('[Stage] failed', {
    jobId, stage: key, code: error?.code, retryable: error?.retryable, attempt: error?.attempt, durationMs, error: error?.detail || error?.message,
  });
  if (stage) emit(jobId, key, stage);
  return stage;
}

async function cancel(jobId, key, { durationMs } = {}) {
  const stage = await write(jobId, key, {
    $set: {
      [path(key, 'status')]: STAGE_STATE.CANCELLED,
      [path(key, 'completedAt')]: new Date(),
      [path(key, 'durationMs')]: durationMs ?? null,
    },
  }, 'stage cancellation');
  LoggerService.info('[Stage] cancelled', { jobId, stage: key });
  if (stage) emit(jobId, key, stage);
  return stage;
}

/**
 * A stage's stored output is stale: reset it and everything downstream of it to
 * pending, keeping attempt counters (they are history, not output). Pass the
 * earliest stage that has to run again (e.g. 'images' after a re-rolled picture).
 */
async function invalidate(jobId, fromKey) {
  if (!isStageKey(fromKey) || !connected()) return;
  const $set = {};
  for (const key of DOWNSTREAM[fromKey]) {
    $set[path(key, 'status')] = STAGE_STATE.PENDING;
    $set[path(key, 'startedAt')] = null;
    $set[path(key, 'completedAt')] = null;
    $set[path(key, 'durationMs')] = null;
    $set[path(key, 'reused')] = false;
    $set[path(key, 'error')] = null;
  }
  try {
    await VideoJob.updateOne({ _id: jobId, stages: { $exists: true } }, { $set });
  } catch (err) {
    LoggerService.warn('[Stage] could not invalidate stages', { jobId, from: fromKey, error: err.message });
  }
}

/**
 * The process that was running this job is gone (restart sweep, stalled limit).
 * Any stage still marked running did not finish: mark it failed so the record
 * matches reality and a Restart resumes at the right stage.
 */
async function markInterrupted(jobId, error) {
  if (!connected()) return null;
  let job;
  try {
    job = await VideoJob.findById(jobId).select('stages').lean();
  } catch (err) {
    LoggerService.warn('[Stage] could not read stages to mark interruption', { jobId, error: err.message });
    return null;
  }
  const running = STAGE_ORDER.find((key) => job?.stages?.[key]?.status === STAGE_STATE.RUNNING);
  if (!running) return null;
  await fail(jobId, running, { ...error, stage: running });
  return running;
}

/** The stage a retry must resume at: the failed/running/cancelled one, else null. */
function resumeStageOf(job) {
  const stages = job?.stages;
  if (!stages) return null;
  for (const key of STAGE_ORDER) {
    const status = stages[key]?.status;
    if (status === STAGE_STATE.FAILED || status === STAGE_STATE.RUNNING || status === STAGE_STATE.CANCELLED) return key;
  }
  return null;
}

module.exports = { begin, complete, fail, cancel, invalidate, markInterrupted, resumeStageOf };
