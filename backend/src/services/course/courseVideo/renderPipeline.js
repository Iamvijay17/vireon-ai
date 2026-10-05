const fs = require('fs').promises;
const path = require('path');
const CourseVideo = require('../../../models/CourseVideo');
const CourseService = require('../CourseService');
const LoggerService = require('../../common/LoggerService');
const SocketService = require('../../common/SocketService');
const ActivityLogService = require('../../common/ActivityLogService');
const RemotionService = require('../../video/RemotionService');
const RemotionStatus = require('../../localAI/remotionStatus');
const LocalAIService = require('../../localAI');
const config = require('../../../config');
const { ensureSceneImages, needsImage } = require('../../image/sceneImages');
const { runLayoutQc } = require('../../qc/runLayoutQc');
const { IMAGE_SCENE_FIELDS } = require('../../image/fields');
const StorageService = require('../../storage/StorageService');
const { getStorageProvider } = require('../../storage/providers');
const { VIDEO_STATUS, STAGE_STATUS } = require('../../../constants');
const { classifyError } = require('../../../utils/errorMessages');
const { bailIfCancelled } = require('./shared');
const { NotFoundError, ValidationError } = require('../../../utils/errors');

/**
 * Render a video using the actual Remotion pipeline.
 * Prepares assets, then calls RemotionService to render.
 * Falls back to a placeholder if Remotion is unavailable.
 */
async function renderVideo(videoId) {
  const video = await CourseVideo.findById(videoId);
  if (!video) {
    throw new NotFoundError('Video not found');
  }

  if (!video.audioUrl) {
    throw new ValidationError('Audio must be generated before rendering the video');
  }

  video.status = VIDEO_STATUS.RENDERING_VIDEO;
  video.videoStatus = STAGE_STATUS.PROCESSING;
  video.renderProgress = 0;
  await video.save();

  await ActivityLogService.add(videoId, 'Rendering started');
  SocketService.emitCourseVideoProgress(video, VIDEO_STATUS.RENDERING_VIDEO, 60, 'Preparing assets for rendering...');

  try {
    if (!video.script?.scenes?.length) {
      throw new Error('No scenes found in script');
    }

    // Plain object copy so it can be freely spread/mutated below.
    const scriptData = video.script.toObject();
    let scenes = scriptData.scenes;

    // Scene images, or their text-only fallbacks (see services/image/sceneImages.js).
    // Done before the audio files are mapped below so the render sees the final scenes.
    if (scenes.some(needsImage)) {
      await bailIfCancelled(videoId);
      const distinct = new Set(scenes.filter(needsImage).map((s) => s.imagePrompt.trim())).size;

      video.status = VIDEO_STATUS.GENERATING_IMAGES;
      await video.save();
      await ActivityLogService.add(videoId, `Image generation started (${distinct} image${distinct === 1 ? '' : 's'})`);
      SocketService.emitCourseVideoProgress(video, VIDEO_STATUS.GENERATING_IMAGES, 61, 'Generating scene images...');

      const generate = () => ensureSceneImages({
        id: String(video._id),
        scenes,
        aspectRatio: '16:9', // course videos are always landscape
        checkCancelled: () => bailIfCancelled(videoId),
        // Saved as each image lands, so a crash mid-batch keeps the finished ones.
        persist: async (changed) => {
          for (const next of changed) {
            const target = video.script.scenes.find((s) => s.sceneNumber === next.sceneNumber);
            if (!target) continue;
            for (const field of IMAGE_SCENE_FIELDS) {
              if (field in next) target[field] = next[field];
            }
          }
          await video.save();
        },
        onProgress: (done, total) =>
          SocketService.emitCourseVideoProgress(video, VIDEO_STATUS.GENERATING_IMAGES, 61 + Math.round((done / total) * 3), 'Generating scene images...'),
      });
      const imageResult = await (config.imageGen.enabled ? LocalAIService.gpu.withGPU('comfyui', generate) : generate());

      scenes = imageResult.scenes;
      scriptData.scenes = scenes;
      if (imageResult.generated + imageResult.cached > 0) {
        await ActivityLogService.add(videoId, `Images ready: ${imageResult.generated} generated, ${imageResult.cached} from cache.`);
      }
      if (imageResult.degraded.length > 0) {
        await ActivityLogService.add(
          videoId,
          `${imageResult.degraded.length} scene(s) rendered as text instead of an image (${imageResult.reasons.join('; ').slice(0, 300)}).`
        );
      }

      video.status = VIDEO_STATUS.RENDERING_VIDEO;
      await video.save();
    }

     // Map audio files to scenes - use videoId as job directory
     const jobId = video._id.toString();
     const scenesWithAudio = scenes.map((scene) => {
       const sceneNum = scene.sceneNumber || 1;
       // Determine sceneType if not present (based on position)
       let sceneType = scene.sceneType;
       if (!sceneType) {
         sceneType = sceneNum === 1 ? 'title' : 'content';
       }
       // Use audio duration if available (set during generateAudio), otherwise use scene duration
       const audioDuration = scene.audio?.duration || scene.duration || 8;

       // Also update the scene duration to match the audio duration for proper rendering
       return {
         ...scene,
         sceneType,
         duration: audioDuration, // Update scene duration to match audio
         audio: {
           ...scene.audio,
           file: `scene${sceneNum}.mp3`,
           duration: audioDuration,
         },
       };
     });

     // Log the scene durations for debugging
     const totalSceneDuration = scenesWithAudio.reduce((sum, s) => sum + (s.duration || 8), 0);
     LoggerService.info('Scene durations mapped for video rendering', {
       videoId,
       sceneDurations: scenesWithAudio.map(s => ({ sceneNumber: s.sceneNumber, duration: s.duration, audioDuration: s.audio?.duration })),
       totalDuration: totalSceneDuration,
     });

    // Build the script object for Remotion
    const remotionScript = {
      title: scriptData.title || video.title,
      description: scriptData.description || '',
      scenes: scenesWithAudio,
    };

    // Job config
    const jobConfig = {
      resolution: video.resolution || '1920x1080',
      quality: video.quality || 'standard',
      aspectRatio: '16:9',
      type: video.style || 'educational',
    };

    // Prepare assets for Remotion
    SocketService.emitCourseVideoProgress(video, VIDEO_STATUS.RENDERING_VIDEO, 65, 'Preparing assets...');

    const preparedAssets = await RemotionService.prepareAssets(jobId, remotionScript, jobConfig);

    // Cheap structural/asset checks before committing to a render - see
    // RemotionService.validateAssets. Checked against scenesWithAudio (has
    // scene.audio.text and imagePrompt) rather than the assets.json shape,
    // which strips audio.text.
    await RemotionService.validateAssets(jobId, scenesWithAudio);

    // Optional layout check (QC_ENABLED) - see services/qc/runLayoutQc.js.
    await runLayoutQc({ id: jobId, assets: preparedAssets });

    // Update progress
    video.renderProgress = 70;
    await video.save();

    SocketService.emitCourseVideoProgress(video, VIDEO_STATUS.RENDERING_VIDEO, 80, 'Rendering video...');

    // Rendering spans 80-89% (90 is reserved for the upload step that
    // follows) - mirrors videoWorker/renderStep.js's mapping of Remotion's
    // own progress fraction into a band, throttled so this doesn't spam
    // socket events or DB writes on every frame.
    let lastEmittedProgress = -1;
    let lastEmitTime = 0;
    const onRenderProgress = (fraction) => {
      const mapped = 80 + Math.round(Math.min(1, Math.max(0, fraction)) * 9);
      if (mapped === lastEmittedProgress) return;
      const now = Date.now();
      if (mapped < 89 && now - lastEmitTime < 1500) return;
      lastEmittedProgress = mapped;
      lastEmitTime = now;
      SocketService.emitCourseVideoProgress(video, VIDEO_STATUS.RENDERING_VIDEO, mapped, 'Rendering video...');
      CourseVideo.findByIdAndUpdate(videoId, { renderProgress: mapped }).catch((err) => {
        LoggerService.warn('Failed to persist course video render progress', { videoId, error: err.message });
      });
    };

    // Try Remotion render - throw error if it fails
    RemotionStatus.begin();
    try {
      await RemotionService.renderVideo(jobId, null, onRenderProgress);
    } finally {
      RemotionStatus.end();
    }

    video.renderedAt = new Date();
    video.renderProgress = 90;
    video.status = VIDEO_STATUS.UPLOADING;
    await video.save();

    await ActivityLogService.add(videoId, 'Rendering complete. Uploading to storage...');
    SocketService.emitCourseVideoProgress(video, VIDEO_STATUS.UPLOADING, 90, 'Uploading to storage...');

    // Upload the render output - the only "big" upload left, since
    // audio was already uploaded inline as it was produced
    // (see AudioService._synthesizeSceneAudio);
    // script is only ever local scratch data, never uploaded to storage.
    const renderDir = StorageService.getRenderDir(jobId);
    const renderFileNames = await fs.readdir(renderDir).catch(() => []);
    for (const fileName of renderFileNames) {
      const url = await getStorageProvider().uploadFile(jobId, path.join(renderDir, fileName), 'render');
      if (/\.(mp4|mov|webm)$/i.test(fileName)) video.renderUrl = url;
    }

    LoggerService.info('Course video rendered and uploaded', { videoId, renderUrl: video.renderUrl });
    await ActivityLogService.add(videoId, 'Uploaded to storage.');

    video.status = VIDEO_STATUS.COMPLETED;
    video.videoStatus = STAGE_STATUS.COMPLETED;
    video.renderProgress = 100;
    await video.save();

    // Update course status
    await CourseService.recalculateStatus(video.courseId);

    // Scratch directory is done being useful - everything of value is
    // already durably in storage (see cleanupJob's doc comment).
    await StorageService.cleanupJob(jobId);

    LoggerService.info('Course video render completed', {
      videoId,
      courseId: video.courseId,
      renderUrl: video.renderUrl,
    });

    await ActivityLogService.add(videoId, 'Video rendering completed!', video.renderedAt);
    SocketService.emitCourseVideoRenderReady(video, 'Video completed!');

    return video;
  } catch (err) {
    if (err.cancelled) {
      await ActivityLogService.add(videoId, 'Rendering stopped by user');
      throw err;
    }

    const { friendly, detail } = classifyError(err, 'Rendering');

    video.status = VIDEO_STATUS.FAILED;
    video.videoStatus = STAGE_STATUS.FAILED;
    video.videoError = { message: friendly, failedAt: new Date() };
    video.error = {
      message: friendly,
      detail,
      step: 'Rendering',
      retryCount: (video.error?.retryCount || 0) + 1,
    };
    await video.save();

    await ActivityLogService.add(videoId, `Rendering failed: ${friendly}`);
    SocketService.emitCourseVideoFailed(video, friendly, 'Rendering');

    throw err;
  }
}

module.exports = { renderVideo };
