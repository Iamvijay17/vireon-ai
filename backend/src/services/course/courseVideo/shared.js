const CourseVideo = require('../../../models/CourseVideo');
const { VIDEO_STATUS } = require('../../../constants');

/**
 * Thrown when a course video is found to be CANCELLED at one of the
 * pipeline's checkpoints. Caught specially in generateScript/generateAudio/
 * renderVideo (and by courseVideoWorker.js's outer catch) so cancellation
 * doesn't get treated as a failure (no FAILED status, no BullMQ retry).
 */
class CourseVideoCancelledError extends Error {
  constructor(videoId) {
    super(`Course video ${videoId} was cancelled`);
    this.name = 'CourseVideoCancelledError';
    this.cancelled = true;
  }
}

/**
 * Checkpoint called at the start of each pipeline stage and between
 * per-scene audio iterations. There's no way to kill an in-flight LM
 * Studio/TTS/Remotion call directly, so cancellation only takes effect at
 * these checkpoints - mirrors videoWorker.js's `bailIfCancelled` for the
 * standalone VideoJob pipeline.
 */
async function bailIfCancelled(videoId) {
  const current = await CourseVideo.findById(videoId).select('status').lean().catch(() => null);
  if (current?.status === VIDEO_STATUS.CANCELLED) {
    throw new CourseVideoCancelledError(videoId);
  }
}

module.exports = { CourseVideoCancelledError, bailIfCancelled };
