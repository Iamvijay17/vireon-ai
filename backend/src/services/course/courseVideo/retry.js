const CourseVideo = require('../../../models/CourseVideo');
const ActivityLogService = require('../../common/ActivityLogService');
const { VIDEO_STATUS } = require('../../../constants');
const { generateScript } = require('./scriptPipeline');
const { generateAudio } = require('./audioPipeline');
const { renderVideo } = require('./renderPipeline');
const { NotFoundError, ValidationError } = require('../../../utils/errors');

/**
 * Mark a failed step as retry-pending (RETRY_SCHEDULED) instead of leaving
 * it terminally FAILED - the worker automatically re-enqueues the same
 * action after a backoff delay (see courseVideoWorker.js's outer catch).
 * `retryCount`/`error.step` are left untouched here since the pipeline
 * module that just failed already wrote them before rethrowing.
 */
async function scheduleRetry(videoId, { nextRetryAt } = {}) {
  const video = await CourseVideo.findByIdAndUpdate(
    videoId,
    { $set: { status: VIDEO_STATUS.RETRY_SCHEDULED, nextRetryAt } },
    { new: true }
  );
  if (!video) {
    throw new NotFoundError('Video not found');
  }
  return video;
}

/**
 * Retry a failed video step.
 */
async function retryStep(videoId) {
  const video = await CourseVideo.findById(videoId);
  if (!video) {
    throw new NotFoundError('Video not found');
  }

  if (video.status !== VIDEO_STATUS.FAILED) {
    throw new ValidationError(`Video is in ${video.status} state, not Failed`);
  }

  const failedStep = video.error?.step || 'Script Generation';

  // Clear error
  video.error = { message: '', step: '', retryCount: 0 };
  await video.save();

  await ActivityLogService.add(videoId, `Retrying ${failedStep}...`);

  // Retry based on the failed step
  switch (failedStep) {
    case 'Script Generation':
      return generateScript(videoId);
    case 'Audio Generation':
      return generateAudio(videoId);
    case 'Rendering':
      return renderVideo(videoId);
    default:
      return generateScript(videoId);
  }
}

module.exports = { retryStep, scheduleRetry };
