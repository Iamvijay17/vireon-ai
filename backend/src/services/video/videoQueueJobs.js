const videoQueue = require('../../queues/videoQueue');
const { retryJobId } = require('../common/retryPolicy');

/**
 * BullMQ lookups for one video job.
 *
 * A video job is not always queued under its own id: an automatic retry runs
 * under `<id>:retry:<n>-<ts>` (see retryPolicy.retryJobId), so a plain
 * `videoQueue.getJob(id)` misses it. Every "is this job still live?" check -
 * the boot sweep, Restart's active guard, Stop - goes through here so a
 * running or pending retry is seen too.
 */

const LIVE_STATES = ['active', 'waiting', 'delayed', 'paused', 'prioritized'];

/** Live BullMQ jobs (any id) whose data points at this video job. */
async function findLiveJobs(videoJobId) {
  const id = String(videoJobId);
  const jobs = await videoQueue.getJobs(LIVE_STATES, 0, -1);
  return jobs.filter((j) => j && String(j.data?.jobId) === id);
}

/** True when a worker currently holds a BullMQ job for this video job. */
async function isActive(videoJobId) {
  for (const job of await findLiveJobs(videoJobId)) {
    if ((await job.getState()) === 'active') return true;
  }
  return false;
}

/** Remove every not-yet-started BullMQ job for this video job. Returns how many. */
async function removePending(videoJobId) {
  let removed = 0;
  for (const job of await findLiveJobs(videoJobId)) {
    const state = await job.getState();
    if (state !== 'active') {
      await job.remove();
      removed += 1;
    }
  }
  return removed;
}

/**
 * The BullMQ id for a job's scheduled retry. Derived from `nextRetryAt`, so
 * the worker that schedules it and any later recovery sweep compute the same
 * id - and BullMQ's duplicate-id rule then stops two processes (dev and prod
 * share this queue) from both queueing it.
 */
const scheduledRetryId = (videoJob) =>
  retryJobId(videoJob._id, videoJob.error?.retryCount || 1, new Date(videoJob.nextRetryAt || 0).getTime());

/**
 * Queue the retry a RETRY_SCHEDULED job is waiting for, unless one already
 * is. Returns true when it had to add one (the job was stranded).
 */
async function ensureScheduledRetry(videoJob) {
  if ((await findLiveJobs(videoJob._id)).length > 0) return false;

  const id = scheduledRetryId(videoJob);
  // A finished record under the same id (kept 24h) would make add() a no-op.
  const stale = await videoQueue.getJob(id);
  if (stale) await stale.remove();

  const delay = Math.max(0, new Date(videoJob.nextRetryAt || 0).getTime() - Date.now());
  await videoQueue.add('render-video', { jobId: String(videoJob._id) }, { jobId: id, delay });
  return true;
}

module.exports = { findLiveJobs, isActive, removePending, scheduledRetryId, ensureScheduledRetry };
