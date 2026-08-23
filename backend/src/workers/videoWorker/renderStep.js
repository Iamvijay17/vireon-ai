const fs = require('fs').promises;
const path = require('path');
const LoggerService = require('../../services/common/LoggerService');
const ActivityLogService = require('../../services/common/ActivityLogService');
const RemotionService = require('../../services/video/RemotionService');
const VideoService = require('../../services/video/VideoService');
const SocketService = require('../../services/common/SocketService');
const { JOB_STATUS } = require('../../constants');

/**
 * Step 6: prepare Remotion assets.json - always regenerated (not skipped
 * on resume) to pick up the latest imageUrl/templateId, unlike the
 * script/audio steps above.
 */
async function prepareAssets(jobId, videoJob, script, avatarVideoUrl, ctx) {
  // Delete old assets.json if it exists to force regeneration with updated data
  const oldAssetsPath = path.resolve(__dirname, '../../../jobs', jobId, 'assets.json');
  try { await fs.unlink(oldAssetsPath); } catch {}

  ctx.currentStep = JOB_STATUS.PREPARING_ASSETS;
  await VideoService.updateStatus(jobId, JOB_STATUS.PREPARING_ASSETS, { progress: 70 });
  SocketService.emitJobProgress({ _id: jobId, progress: 70, status: JOB_STATUS.PREPARING_ASSETS, currentStep: JOB_STATUS.PREPARING_ASSETS, currentScene: 0 });

  const assets = await RemotionService.prepareAssets(jobId, script, {
    resolution: videoJob.resolution,
    aspectRatio: videoJob.aspectRatio,
    type: videoJob.type,
    avatar: avatarVideoUrl ? { videoUrl: avatarVideoUrl, position: videoJob.avatarPosition } : undefined,
  });

  LoggerService.success('Assets prepared');

  return assets;
}

/**
 * Step 7: render the video via Remotion. A crash/stalled-job recovery
 * re-enters this step with the exact same assets it already rendered
 * successfully - re-rendering (the most expensive step in the pipeline,
 * often minutes) is pure waste in that case. isRenderCurrent only returns
 * true when a prior render's recorded fingerprint matches these exact
 * assets, so an edited scene/regenerated image (which changes assets
 * content) still triggers a real re-render - see
 * RemotionService.isRenderCurrent.
 */
async function render(jobId, assets, ctx) {
  ctx.currentStep = JOB_STATUS.RENDERING;
  await VideoService.updateStatus(jobId, JOB_STATUS.RENDERING, { progress: 80 });
  SocketService.emitJobProgress({ _id: jobId, progress: 80, status: JOB_STATUS.RENDERING, currentStep: JOB_STATUS.RENDERING, currentScene: 0 });

  const renderIsCurrent = await RemotionService.isRenderCurrent(jobId, assets);

  if (renderIsCurrent) {
    LoggerService.info('Existing render already matches current assets - skipping re-render', { jobId });
    await ActivityLogService.add(jobId, 'Using existing render (unchanged since last render)');
  } else {
    // Remove old render if it exists to force a clean re-render
    try { await fs.rm(path.resolve(__dirname, '../../../jobs', jobId, 'render'), { recursive: true, force: true }); } catch {}

    await ActivityLogService.add(jobId, 'Rendering started');

    const renderResult = await RemotionService.renderVideo(jobId, assets);

    LoggerService.success('Video rendered', renderResult);
  }
}

module.exports = { prepareAssets, render };
