const fs = require('fs').promises;
const path = require('path');
const LoggerService = require('../../services/common/LoggerService');
const ActivityLogService = require('../../services/common/ActivityLogService');
const RemotionService = require('../../services/video/RemotionService');
const RemotionStatus = require('../../services/localAI/remotionStatus');
const VideoService = require('../../services/video/VideoService');
const SocketService = require('../../services/common/SocketService');
const { JOB_STATUS, JOB_STEPS } = require('../../constants');

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
  await VideoService.updateStatus(jobId, JOB_STATUS.PREPARING_ASSETS);
  SocketService.emitJobProgress({ _id: jobId, progress: JOB_STEPS[JOB_STATUS.PREPARING_ASSETS].progress, status: JOB_STATUS.PREPARING_ASSETS, currentStep: JOB_STATUS.PREPARING_ASSETS, currentScene: 0 });

  const assets = await RemotionService.prepareAssets(jobId, script, {
    resolution: videoJob.resolution,
    quality: videoJob.quality,
    aspectRatio: videoJob.aspectRatio,
    fontPairing: videoJob.fontPairing,
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
async function render(jobId, assets, ctx, script) {
  // Cheap structural/asset checks before committing to a render - see
  // RemotionService.validateAssets. Runs before the status flips to
  // RENDERING so a validation failure doesn't even show the job as having
  // started rendering. Validated against the source script's scenes, not
  // assets.scenes - prepareAssets strips scene.audio.text, which the
  // "narration text but 0-duration audio" check needs.
  ctx.currentStep = 'Validation';
  await RemotionService.validateAssets(jobId, script.scenes);

  ctx.currentStep = JOB_STATUS.RENDERING;
  await VideoService.updateStatus(jobId, JOB_STATUS.RENDERING);
  SocketService.emitJobProgress({ _id: jobId, progress: JOB_STEPS[JOB_STATUS.RENDERING].progress, status: JOB_STATUS.RENDERING, currentStep: JOB_STATUS.RENDERING, currentScene: 0 });

  const renderIsCurrent = await RemotionService.isRenderCurrent(jobId, assets);

  if (renderIsCurrent) {
    LoggerService.info('Existing render already matches current assets - skipping re-render', { jobId });
    await ActivityLogService.add(jobId, 'Using existing render (unchanged since last render)');
  } else {
    // Remove old render if it exists to force a clean re-render
    try { await fs.rm(path.resolve(__dirname, '../../../jobs', jobId, 'render'), { recursive: true, force: true }); } catch {}

    await ActivityLogService.add(jobId, 'Rendering started');

    RemotionStatus.begin();
    let renderResult;
    try {
      // RENDERING spans 85-94% (95 is reserved for UPLOADING) - Remotion's
      // own progress fraction (bundling+render+encode, see RemotionService's
      // parseRemotionProgressLine) is mapped into that band and throttled so
      // a multi-minute render doesn't sit frozen at 85% the whole time.
      let lastEmittedProgress = -1;
      let lastEmitTime = 0;
      const onRenderProgress = (fraction) => {
        const mapped = 85 + Math.round(Math.min(1, Math.max(0, fraction)) * 9);
        if (mapped === lastEmittedProgress) return;
        const now = Date.now();
        if (mapped < 94 && now - lastEmitTime < 1500) return;
        lastEmittedProgress = mapped;
        lastEmitTime = now;
        SocketService.emitJobProgress({ _id: jobId, progress: mapped, status: JOB_STATUS.RENDERING, currentStep: JOB_STATUS.RENDERING, currentScene: 0 });
        VideoService.updateStatus(jobId, JOB_STATUS.RENDERING, { progress: mapped }).catch((err) => {
          LoggerService.warn('Failed to persist render progress', { jobId, error: err.message });
        });
      };

      renderResult = await RemotionService.renderVideo(jobId, assets, onRenderProgress);
    } finally {
      RemotionStatus.end();
    }

    LoggerService.success('Video rendered', renderResult);
  }
}

module.exports = { prepareAssets, render };
