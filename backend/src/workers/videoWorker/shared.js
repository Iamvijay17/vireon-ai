const VideoService = require('../../services/video/VideoService');
const { JOB_STATUS } = require('../../constants');

/**
 * Thrown when a job is found to be CANCELLED at one of the worker's
 * checkpoints. Caught specially in the outer catch block so cancellation
 * doesn't get treated as a failure (no FAILED status, no BullMQ retry).
 */
class JobCancelledError extends Error {
  constructor(jobId) {
    super(`Job ${jobId} was cancelled`);
    this.name = 'JobCancelledError';
    this.cancelled = true;
  }
}

/**
 * Checkpoint called between pipeline steps and per-scene loop iterations.
 * There's no way to kill an in-flight LM Studio/TTS/Remotion/upload
 * call directly, so cancellation only takes effect at these checkpoints -
 * the worker can be mid-step for a while after a stop request before it
 * actually notices and bails out.
 */
async function bailIfCancelled(jobId) {
  const current = await VideoService.getById(jobId).catch(() => null);
  if (current?.status === JOB_STATUS.CANCELLED) {
    throw new JobCancelledError(jobId);
  }
}

module.exports = { JobCancelledError, bailIfCancelled };
