const { retryJobId } = require('./retryPolicy');

const LIVE_STATES = ['active', 'waiting', 'delayed', 'paused', 'prioritized'];

/**
 * BullMQ lookups for one entity (a video job, a course video) on a queue.
 *
 * An entity is not always queued under its own id - an automatic retry runs
 * under `<id>:retry:<n>-<ts>` (see retryPolicy.retryJobId) and course jobs
 * never use the entity id at all - so "is this still live?" means scanning
 * the live jobs for `job.data[entityField]`. Both queues' helpers
 * (video/videoQueueJobs.js, course/courseQueueJobs.js) are built on this.
 */
function createQueueJobs(queue, entityField) {
  /** Live BullMQ jobs (any id) whose data points at this entity. */
  async function findLiveJobs(entityId) {
    const id = String(entityId);
    const jobs = await queue.getJobs(LIVE_STATES, 0, -1);
    return jobs.filter((j) => j && String(j.data?.[entityField]) === id);
  }

  /** True when a worker currently holds a BullMQ job for this entity. */
  async function isActive(entityId) {
    for (const job of await findLiveJobs(entityId)) {
      if ((await job.getState()) === 'active') return true;
    }
    return false;
  }

  /** Remove every not-yet-started BullMQ job for this entity. Returns how many. */
  async function removePending(entityId) {
    let removed = 0;
    for (const job of await findLiveJobs(entityId)) {
      if ((await job.getState()) !== 'active') {
        await job.remove();
        removed += 1;
      }
    }
    return removed;
  }

  /**
   * The BullMQ id for an entity's scheduled retry. Derived from the saved
   * `nextRetryAt`, so the worker that schedules it and any recovery sweep
   * compute the same id - and BullMQ's duplicate-id rule then stops two
   * processes (dev and prod share these queues) from both queueing it.
   */
  const scheduledRetryId = (entity) =>
    retryJobId(entity._id, entity.error?.retryCount || 1, new Date(entity.nextRetryAt || 0).getTime());

  /**
   * Queue the retry an entity is waiting for under its scheduled id, due at
   * `nextRetryAt` (or now, if that has passed). Returns false, adding
   * nothing, when a live job for the entity already exists.
   */
  async function queueScheduledRetry(entity, name, data) {
    if ((await findLiveJobs(entity._id)).length > 0) return false;
    const id = scheduledRetryId(entity);
    // A finished record under the same id (kept for a while) would make add() a no-op.
    const stale = await queue.getJob(id);
    if (stale) await stale.remove();
    const delay = Math.max(0, new Date(entity.nextRetryAt || 0).getTime() - Date.now());
    await queue.add(name, data, { jobId: id, delay });
    return true;
  }

  return { findLiveJobs, isActive, removePending, scheduledRetryId, queueScheduledRetry };
}

module.exports = { createQueueJobs, LIVE_STATES };
