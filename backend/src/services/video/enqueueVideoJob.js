const videoQueue = require('../../queues/videoQueue');
const videoQueueJobs = require('./videoQueueJobs');
const LoggerService = require('../common/LoggerService');

/**
 * (Re-)enqueue a job for the worker, always under a BullMQ jobId matching
 * our own Mongo _id (so /stop can look it up and remove it if still
 * queued). BullMQ treats `.add()` with an id that already exists as a
 * no-op - it does NOT create a new job run - so every restart/approve/
 * rerender/regenerate call needs to clear out the job's old BullMQ record
 * first (which sticks around for a while: removeOnComplete/removeOnFail
 * are age-based, 24h/7d), or the DB status updates but the worker never
 * actually reprocesses it.
 */
async function enqueueVideoJob(jobId) {
  try {
    // A pending automatic retry (its own `:retry:` id) would otherwise fire
    // later and run the job a second time.
    await videoQueueJobs.removePending(jobId);
    const existing = await videoQueue.getJob(jobId);
    if (existing) {
      await existing.remove();
    }
  } catch (err) {
    // Can't remove an actively-processing job (still locked) - fine, that
    // means it's already running and doesn't need re-adding anyway.
    LoggerService.warn('Could not clear prior BullMQ record before re-queueing', { jobId, error: err.message });
  }
  await videoQueue.add('render-video', { jobId }, { jobId });
}

module.exports = enqueueVideoJob;
