const PublishingJob = require('../../models/PublishingJob');
const LoggerService = require('../common/LoggerService');
const { PUBLISH_STATUS } = require('../../constants');
const { retryJobId } = require('../common/retryPolicy');

const S = PUBLISH_STATUS;
const SWEEP_INTERVAL_MS = 2 * 60_000;
// Give a freshly submitted job's own enqueue a moment before the sweep second-guesses it.
const QUEUED_GRACE_MS = 30_000;

/**
 * Find publishing jobs that are persisted as "should be running" but have
 * nothing driving them, and put them back on the queue:
 *
 *  - QUEUED for a while      the API saved it, then Redis was down / lost the job
 *  - RETRYING, wait is over  the delayed BullMQ job was lost (Redis restart, flush)
 *  - PROCESSING, check due   same, for the "is YouTube done yet" re-check
 *  - an active status whose lease expired   the worker died mid-run
 *
 * Re-enqueueing is idempotent twice over: BullMQ drops a job id it already
 * holds (the ids are derived from the job's own timestamps, matching what the
 * normal path used), and the worker's claim is an atomic, lease-guarded
 * transition, so a duplicate delivery just finds nothing to claim.
 */
async function sweepPublishingJobs({ platform, enqueue, Job = PublishingJob, now = () => Date.now() }) {
  const at = new Date(now());
  const queuedBefore = new Date(now() - QUEUED_GRACE_MS);
  const stale = { $or: [{ 'lease.expiresAt': null }, { 'lease.expiresAt': { $lt: at } }] };

  const jobs = await Job.find({
    platform,
    $or: [
      { status: S.QUEUED, queuedAt: { $lte: queuedBefore } },
      { status: { $in: [S.RETRYING, S.PROCESSING] }, nextRetryAt: { $lte: at } },
      { status: { $in: [S.VALIDATING, S.UPLOADING, S.PROCESSING] }, nextRetryAt: null, ...stale },
    ],
  }).limit(200);

  let requeued = 0;
  for (const job of jobs) {
    try {
      const stamp = job.nextRetryAt || job.lease?.expiresAt || job.queuedAt || at;
      await enqueue(job, { delayMs: 0, jobId: retryJobId(job._id, job.attempts || 0, new Date(stamp).getTime()) });
      requeued += 1;
    } catch (err) {
      LoggerService.warn('Publishing recovery could not re-enqueue a job', { jobId: job._id, error: err.message });
    }
  }
  if (requeued) LoggerService.info(`Publishing recovery re-enqueued ${requeued} job(s)`, { platform });
  return requeued;
}

module.exports = { sweepPublishingJobs, SWEEP_INTERVAL_MS };
