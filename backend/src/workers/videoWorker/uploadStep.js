const fs = require('fs').promises;
const path = require('path');
const LoggerService = require('../../services/common/LoggerService');
const ActivityLogService = require('../../services/common/ActivityLogService');
const VideoService = require('../../services/video/VideoService');
const StorageService = require('../../services/storage/StorageService');
const { getStorageProvider } = require('../../services/storage/providers');
const SocketService = require('../../services/common/SocketService');
const { JOB_STATUS } = require('../../constants');

/**
 * Step 8-9: upload the render output - the only "big" upload left, since
 * audio/avatar were already uploaded inline as they were produced (see
 * AudioService/AvatarService); script/assets are only ever local scratch
 * data, never uploaded to storage. Then completes the job and cleans up
 * its local scratch directory.
 */
async function run(jobId, script, ctx) {
  ctx.currentStep = JOB_STATUS.UPLOADING;
  await VideoService.updateStatus(jobId, JOB_STATUS.UPLOADING, { progress: 95 });
  SocketService.emitJobProgress({ _id: jobId, progress: 95, status: JOB_STATUS.UPLOADING, currentStep: JOB_STATUS.UPLOADING, currentScene: 0 });

  const renderDir = path.resolve(__dirname, '../../../jobs', jobId, 'render');
  const renderFileNames = await fs.readdir(renderDir).catch(() => []);
  let videoUrl = '';
  let thumbnailUrl = '';
  for (const fileName of renderFileNames) {
    const url = await getStorageProvider().uploadFile(jobId, path.join(renderDir, fileName), 'render');
    if (/\.(mp4|mov|webm)$/i.test(fileName)) videoUrl = url;
    else if (/\.(png|jpe?g)$/i.test(fileName)) thumbnailUrl = url;
  }

  LoggerService.success('Render output uploaded', { videoUrl, thumbnailUrl });
  await ActivityLogService.add(jobId, 'Assets uploaded to cloud storage.');

  // Scene audio URLs are deterministic from the storage convention, not
  // tracked through the pipeline - reconstruct them here for the
  // completed job's record.
  const audioUrls = script.scenes
    .filter((s) => s.audio?.file)
    .map((s) => getStorageProvider().getPublicUrl(jobId, 'audio', s.audio.file));

  const completedJob = await VideoService.complete(jobId, {
    videoUrl,
    thumbnailUrl,
    audioUrls,
  });

  SocketService.emitJobCompleted(completedJob);
  await ActivityLogService.add(jobId, 'Video generation completed!');

  LoggerService.border(`✅ Job Complete: ${jobId}`, 'success');
  LoggerService.success('Video generation pipeline finished', {
    jobId,
    videoUrl: completedJob.videoUrl,
  });

  // Cleanup local files
  await StorageService.cleanupJob(jobId);

  return { success: true, jobId };
}

module.exports = { run };
