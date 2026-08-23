const CourseVideo = require('../../../models/CourseVideo');
const ActivityLogService = require('../../common/ActivityLogService');
const { VIDEO_STATUS } = require('../../../constants');
const { generateScript } = require('./scriptPipeline');
const { generateAudio } = require('./audioPipeline');
const { renderVideo } = require('./renderPipeline');

/**
 * Retry a failed video step.
 */
async function retryStep(videoId) {
  const video = await CourseVideo.findById(videoId);
  if (!video) {
    throw { status: 404, message: 'Video not found' };
  }

  if (video.status !== VIDEO_STATUS.FAILED) {
    throw { status: 400, message: `Video is in ${video.status} state, not Failed` };
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

module.exports = { retryStep };
