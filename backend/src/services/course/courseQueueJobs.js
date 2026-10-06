const courseQueue = require('../../queues/courseQueue');
const { createQueueJobs } = require('../common/queueJobs');

/**
 * BullMQ lookups for one course video (see common/queueJobs.js). Course jobs
 * carry the video in `job.data.videoId` and are never keyed by its id.
 */
const { findLiveJobs, scheduledRetryId, queueScheduledRetry } = createQueueJobs(courseQueue, 'videoId');

// The worker action that re-runs a failed stage, keyed by the step label the
// pipelines write to error.step (scriptPipeline / audioPipeline / renderPipeline).
// A failed regenerate-script also records 'Script Generation'; generate-script
// overwrites the script the same way, so it is the right recovery for both.
const ACTION_FOR_STEP = {
  'Script Generation': 'generate-script',
  'Audio Generation': 'generate-audio',
  Rendering: 'render',
};

/** The action a stranded Retry Scheduled video should re-run, or null if its step is unknown. */
const actionForRetry = (video) => ACTION_FOR_STEP[video.error?.step] || null;

/**
 * Queue the retry a Retry Scheduled course video is waiting for, unless one
 * already is. Returns the action queued, or null when nothing was needed (or
 * the failed step can't be mapped back to an action).
 */
async function ensureScheduledRetry(video) {
  const action = actionForRetry(video);
  if (!action) return null;
  const queued = await queueScheduledRetry(video, action, { videoId: String(video._id), action });
  return queued ? action : null;
}

module.exports = { findLiveJobs, scheduledRetryId, actionForRetry, ensureScheduledRetry, ACTION_FOR_STEP };
