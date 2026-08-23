const fs = require('fs').promises;
const path = require('path');
const CourseVideo = require('../../../models/CourseVideo');
const CourseService = require('../CourseService');
const LoggerService = require('../../common/LoggerService');
const SocketService = require('../../common/SocketService');
const ActivityLogService = require('../../common/ActivityLogService');
const AvatarService = require('../../avatar/avatarService');
const RemotionService = require('../../video/RemotionService');
const StorageService = require('../../storage/StorageService');
const { getStorageProvider } = require('../../storage/providers');
const { VIDEO_STATUS, STAGE_STATUS } = require('../../../constants');
const { bailIfCancelled } = require('./shared');

/**
 * Render a video using the actual Remotion pipeline.
 * Prepares assets, then calls RemotionService to render.
 * Falls back to a placeholder if Remotion is unavailable.
 */
async function renderVideo(videoId) {
  const video = await CourseVideo.findById(videoId);
  if (!video) {
    throw { status: 404, message: 'Video not found' };
  }

  if (!video.audioUrl) {
    throw { status: 400, message: 'Audio must be generated before rendering the video' };
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
    const scenes = scriptData.scenes;

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

    // Optional talking-head overlay (see AvatarService, VideoJob's
    // equivalent GENERATING_AVATAR step in videoWorker.js). No
    // user-uploaded photo - the source portrait is a bundled default
    // picked by the video's voice's gender. Course videos have no
    // separate BullMQ pipeline stage the way the standalone wizard does,
    // so this runs as part of the render step, right before assets prep -
    // reused on any subsequent re-render since avatarVideoUrl persists
    // once generated.
    if (video.avatarEnabled && !video.avatarVideoUrl) {
      await bailIfCancelled(videoId);
      SocketService.emitCourseVideoProgress(video, VIDEO_STATUS.RENDERING_VIDEO, 62, 'Generating avatar overlay...');
      await ActivityLogService.add(videoId, 'Avatar generation started');

      const sourceImagePath = AvatarService.resolveDefaultSourceImage(video.voice);
      const avatarResult = await AvatarService.animatePortrait(jobId, sourceImagePath);
      video.avatarVideoUrl = avatarResult.url;
      await video.save();

      await ActivityLogService.add(videoId, 'Avatar overlay generated successfully.');
    }

    // Job config
    const jobConfig = {
      resolution: video.resolution || '1920x1080',
      aspectRatio: '16:9',
      type: video.style || 'educational',
      avatar: video.avatarVideoUrl ? { videoUrl: video.avatarVideoUrl, position: video.avatarPosition } : undefined,
    };

    // Prepare assets for Remotion
    SocketService.emitCourseVideoProgress(video, VIDEO_STATUS.PREPARING_ASSETS, 65, 'Preparing assets...');

    await RemotionService.prepareAssets(jobId, remotionScript, jobConfig);

    // Update progress
    video.renderProgress = 70;
    await video.save();

    SocketService.emitCourseVideoProgress(video, VIDEO_STATUS.RENDERING_VIDEO, 80, 'Rendering video...');

    // Try Remotion render - throw error if it fails
    await RemotionService.renderVideo(jobId);

    video.renderedAt = new Date();
    video.renderProgress = 90;
    video.status = VIDEO_STATUS.UPLOADING;
    await video.save();

    await ActivityLogService.add(videoId, 'Rendering complete. Uploading to storage...');
    SocketService.emitCourseVideoProgress(video, VIDEO_STATUS.UPLOADING, 90, 'Uploading to storage...');

    // Upload the render output - the only "big" upload left, since
    // audio/avatar were already uploaded inline as they were produced
    // (see AudioService._synthesizeSceneAudio, AvatarService.animatePortrait);
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

    video.status = VIDEO_STATUS.FAILED;
    video.videoStatus = STAGE_STATUS.FAILED;
    video.videoError = { message: err.message, failedAt: new Date() };
    video.error = {
      message: err.message,
      step: 'Rendering',
      retryCount: (video.error?.retryCount || 0) + 1,
    };
    await video.save();

    await ActivityLogService.add(videoId, `Rendering failed: ${err.message}`);
    SocketService.emitCourseVideoFailed(video, err.message, 'Rendering');

    throw err;
  }
}

module.exports = { renderVideo };
