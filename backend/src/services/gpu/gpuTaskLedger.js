const mongoose = require('mongoose');
const LoggerService = require('../common/LoggerService');

/**
 * Persists GPU task state to the GpuTask collection.
 *
 * Same contract as pipeline/stageTracker: every write is best-effort. The
 * ledger is an observability and recovery record, so a Mongo hiccup (or a
 * process that never connected - the unit tests, a script) is logged and
 * skipped rather than failing or stalling the GPU task it describes.
 */
const connected = () => mongoose.connection.readyState === 1;

// Lazy: requiring the model registers it on the default connection, which the
// scheduler's unit tests have no reason to touch.
const model = () => require('../../models/GpuTask');

async function write(taskId, update, label) {
  if (!connected()) return;
  try {
    await model().updateOne({ taskId }, update, { upsert: true });
  } catch (err) {
    LoggerService.warn(`[GPU] could not record task ${label}`, { taskId, error: err.message });
  }
}

const iso = (ms) => (ms ? new Date(ms) : undefined);

function queued(task, worker) {
  return write(task.id, {
    $set: {
      key: task.key,
      jobId: task.jobId,
      stage: task.stage,
      service: task.service,
      label: task.label,
      priority: task.priority,
      status: 'queued',
      enqueuedAt: iso(task.enqueuedAt),
      heartbeatAt: new Date(),
      worker,
    },
  }, 'queue entry');
}

function started(task, { attempt, waitMs, admittedUnderPressure }) {
  return write(task.id, {
    $set: { status: 'running', startedAt: new Date(), waitMs, admittedUnderPressure: Boolean(admittedUnderPressure) },
    $max: { attempts: attempt },
  }, 'start');
}

function retrying(task, error) {
  return write(task.id, { $set: { status: 'retrying', error: { code: error?.gpuCode || error?.code, message: String(error?.message || '').slice(0, 500) } } }, 'retry');
}

/** Terminal states: completed | failed | cancelled. */
function finished(task, status, { runMs, error } = {}) {
  const $set = { status, finishedAt: new Date(), runMs };
  if (error) $set.error = { code: error.gpuCode || error.code, message: String(error.message || '').slice(0, 500) };
  return write(task.id, { $set }, status);
}

const OPEN = ['queued', 'running', 'retrying'];

/** Prove a task is still alive. Called on a timer for as long as it is queued or running. */
function touch(task) {
  if (!connected()) return Promise.resolve();
  return model()
    .updateOne({ taskId: task.id, status: { $in: OPEN } }, { $set: { heartbeatAt: new Date() } })
    .catch((err) => LoggerService.warn('[GPU] could not record task heartbeat', { taskId: task.id, error: err.message }));
}

/**
 * Close rows a dead process left open. A live task touches its row every
 * HEARTBEAT_MS, so a row that has been silent for `staleMs` (several missed
 * beats) belongs to a process that crashed or was killed mid-task. Judged by
 * silence rather than by what the job is doing, so a task on a finished video
 * (a scene's audio regenerated) is never mistaken for an orphan.
 */
async function reapAbandoned({ staleMs }) {
  if (!connected()) return 0;
  const cutoff = new Date(Date.now() - staleMs);
  const res = await model().updateMany(
    {
      status: { $in: OPEN },
      $or: [{ heartbeatAt: { $lt: cutoff } }, { heartbeatAt: null, updatedAt: { $lt: cutoff } }],
    },
    {
      $set: {
        status: 'abandoned',
        finishedAt: new Date(),
        error: { code: 'JOB_STALLED', message: 'The process running this task stopped before it finished' },
      },
    }
  );
  return res.modifiedCount || 0;
}

const HEARTBEAT_MS = 60_000;

module.exports = { queued, started, retrying, finished, touch, reapAbandoned, HEARTBEAT_MS };
