const videoQueue = require('../../queues/videoQueue');
const { createQueueJobs } = require('../common/queueJobs');

/**
 * BullMQ lookups for one video job (see common/queueJobs.js). Every "is this
 * job still live?" check - the boot sweep, Restart's active guard, Stop -
 * goes through here so a running or pending automatic retry is seen too.
 */
const { findLiveJobs, isActive, removePending, scheduledRetryId, queueScheduledRetry } = createQueueJobs(videoQueue, 'jobId');

/**
 * Queue the retry a RETRY_SCHEDULED job is waiting for, unless one already
 * is. Returns true when it had to add one (the job was stranded).
 */
const ensureScheduledRetry = (videoJob) =>
  queueScheduledRetry(videoJob, 'render-video', { jobId: String(videoJob._id) });

module.exports = { findLiveJobs, isActive, removePending, scheduledRetryId, ensureScheduledRetry };
