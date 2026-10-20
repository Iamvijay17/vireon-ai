const VideoService = require('../../services/video/VideoService');
const { JOB_STATUS } = require('../../constants');
const { makeAbortError } = require('../../utils/abortableDelay');

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
 * There's no way to kill an in-flight Ollama/TTS/Remotion/upload
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

/**
 * bailIfCancelled plus the step's AbortSignal. Long GPU work (the Director's chunk loop) calls this
 * between units of work. The signal is what a stage timeout fires: without checking it, a timed-out
 * stage's callback would keep generating while holding the GPU slot and the task's dedupe key, and the
 * stage's own retry would queue behind it (or be rejected as a duplicate) until it finished by itself.
 * A Stop is checked first so it still surfaces as a cancellation rather than as a bare abort.
 */
async function checkpoint(jobId, signal) {
  await bailIfCancelled(jobId);
  if (signal?.aborted) throw makeAbortError();
}

/**
 * The job-level settings RemotionService.prepareAssets and the SceneGraph
 * compiler read, in one place so the script-stage and render-stage
 * compiles see the same config.
 */
function renderConfigFor(videoJob) {
  return {
    type: videoJob.type,
    language: videoJob.language,
    resolution: videoJob.resolution,
    quality: videoJob.quality,
    aspectRatio: videoJob.aspectRatio,
    fontPairing: videoJob.fontPairing,
    captionAnimation: videoJob.captionAnimation,
  };
}

module.exports = { JobCancelledError, bailIfCancelled, checkpoint, renderConfigFor };
