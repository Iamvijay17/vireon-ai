const LoggerService = require('../../services/common/LoggerService');
const ActivityLogService = require('../../services/common/ActivityLogService');
const AvatarService = require('../../services/avatar/avatarService');
const VideoService = require('../../services/video/VideoService');
const SocketService = require('../../services/common/SocketService');
const { JOB_STATUS } = require('../../constants');

/**
 * Step 5.5: avatar generation - optional, only for jobs with
 * avatarEnabled; skipped entirely otherwise, and skipped on resume if
 * already generated. No user-uploaded photo - the source portrait is a
 * bundled default picked by the job's voice's gender. Returns the
 * (possibly unchanged) avatarVideoUrl.
 */
async function run(jobId, videoJob, ctx) {
  let avatarVideoUrl = videoJob.avatarEnabled ? videoJob.avatarVideoUrl : null;
  if (!videoJob.avatarEnabled || avatarVideoUrl) {
    return avatarVideoUrl;
  }

  ctx.currentStep = JOB_STATUS.GENERATING_AVATAR;
  await VideoService.updateStatus(jobId, JOB_STATUS.GENERATING_AVATAR, { progress: 55 });
  SocketService.emitJobProgress({ _id: jobId, progress: 55, status: JOB_STATUS.GENERATING_AVATAR, currentStep: JOB_STATUS.GENERATING_AVATAR, currentScene: 0 });

  LoggerService.info('Starting avatar generation', { jobId, voice: videoJob.voice });
  await ActivityLogService.add(jobId, 'Avatar generation started');

  const sourceImagePath = AvatarService.resolveDefaultSourceImage(videoJob.voice);
  const avatarResult = await AvatarService.animatePortrait(jobId, sourceImagePath);
  const jobWithAvatar = await VideoService.updateAvatar(jobId, avatarResult);
  avatarVideoUrl = jobWithAvatar.avatarVideoUrl;

  LoggerService.success('Avatar overlay generated', { jobId });
  await ActivityLogService.add(jobId, 'Avatar overlay generated successfully.');

  return avatarVideoUrl;
}

module.exports = { run };
