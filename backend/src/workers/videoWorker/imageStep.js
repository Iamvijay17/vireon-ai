const config = require('../../config');
const LoggerService = require('../../services/common/LoggerService');
const ActivityLogService = require('../../services/common/ActivityLogService');
const LocalAIService = require('../../services/localAI');
const VideoService = require('../../services/video/VideoService');
const SocketService = require('../../services/common/SocketService');
const { ensureSceneImages, needsImage } = require('../../services/image/sceneImages');
const { JOB_STATUS, getAspectRatioForResolution } = require('../../constants');
const { PROGRESS_BANDS, mapToBand } = require('../../utils/progressBands');
const { bailIfCancelled, JobCancelledError } = require('./shared');

const plain = (scene) => (typeof scene.toObject === 'function' ? scene.toObject() : scene);

/**
 * Step 5.7: scene images - generates the picture for every scene the
 * storyboard gave one, or rewrites the scene as text-only when it can't (image
 * generation off, ComfyUI down, a failed prompt), so a render never fails over
 * a missing picture (see services/image/sceneImages.js for the contract).
 *
 * Skipped entirely when no scene needs an image, and on resume only the scenes
 * still without one are processed - each image is persisted as it lands. The
 * caller re-reads the script afterward, since this step changes scenes.
 */
async function run(jobId, ctx) {
  const job = await VideoService.getById(jobId);
  const scenes = (job.script?.scenes || []).map(plain);
  if (!scenes.some(needsImage)) return;

  const distinct = new Set(scenes.filter(needsImage).map((s) => s.imagePrompt.trim())).size;

  ctx.currentStep = JOB_STATUS.GENERATING_IMAGES;
  await VideoService.updateStatus(jobId, JOB_STATUS.GENERATING_IMAGES, { progress: 56 });
  SocketService.emitJobProgress({ _id: jobId, progress: 56, status: JOB_STATUS.GENERATING_IMAGES, currentStep: JOB_STATUS.GENERATING_IMAGES, currentScene: 0 });

  LoggerService.info('Starting scene image generation', { jobId, images: distinct, enabled: config.imageGen.enabled });
  await ActivityLogService.add(jobId, `Image generation started (${distinct} image${distinct === 1 ? '' : 's'})`);

  const generate = () => ensureSceneImages({
    id: jobId,
    scenes,
    aspectRatio: getAspectRatioForResolution(job.resolution),
    signal: ctx.signal,
    checkCancelled: () => bailIfCancelled(jobId),
    persist: (changed) => VideoService.updateSceneImages(jobId, changed),
    // GENERATING_IMAGES spans 56-59% (60 is IMAGE_COMPLETED).
    onProgress: async (done, total) => {
      const progress = mapToBand(PROGRESS_BANDS.job.images, done / total);
      SocketService.emitJobProgress({ _id: jobId, progress, status: JOB_STATUS.GENERATING_IMAGES, currentStep: JOB_STATUS.GENERATING_IMAGES, currentScene: done });
      VideoService.updateStatus(jobId, JOB_STATUS.GENERATING_IMAGES, { progress }).catch((err) => {
        LoggerService.warn('Failed to persist image progress', { jobId, error: err.message });
      });
    },
  });

  let result;
  try {
    // The GPU slot is only worth claiming when there is a real ComfyUI to run -
    // with generation off this step only rewrites scenes and touches no model.
    result = await (config.imageGen.enabled ? LocalAIService.gpu.withGPU('comfyui', generate) : generate());
  } catch (err) {
    // ctx.signal aborts the moment a Stop request reaches this process (see
    // cancellationBus); ComfyUI is interrupted so the card is freed, not just ignored.
    if (err.name === 'AbortError') throw new JobCancelledError(jobId);
    throw err;
  }

  await VideoService.updateStatus(jobId, JOB_STATUS.IMAGE_COMPLETED, { progress: 60 });
  SocketService.emitJobProgress({ _id: jobId, progress: 60, status: JOB_STATUS.IMAGE_COMPLETED, currentStep: JOB_STATUS.IMAGE_COMPLETED, currentScene: 0 });

  if (result.generated + result.cached > 0) {
    await ActivityLogService.add(
      jobId,
      `Images ready: ${result.generated} generated, ${result.cached} from cache.`
    );
  }
  if (result.degraded.length > 0) {
    await ActivityLogService.add(
      jobId,
      `${result.degraded.length} scene(s) rendered as text instead of an image (${result.reasons.join('; ').slice(0, 300)}).`
    );
  }
  LoggerService.success('Scene images done', { jobId, generated: result.generated, cached: result.cached, degraded: result.degraded.length });
}

module.exports = { run };
