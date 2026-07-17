const { Worker } = require('bullmq');
const mongoose = require('mongoose');
const config = require('../config');
const LoggerService = require('../services/LoggerService');

// Connect to MongoDB on worker startup
mongoose.connect(config.mongodb.uri, {
  serverSelectionTimeoutMS: 5000,
  heartbeatFrequencyMS: 10000,
}).then(() => {
  LoggerService.success('Worker MongoDB connected successfully');
}).catch((err) => {
  LoggerService.error('Worker MongoDB connection failed', { error: err.message });
  process.exit(1);
});
const VideoService = require('../services/VideoService');
const PromptService = require('../services/PromptService');
const LMStudioService = require('../services/LMStudioService');
const ScriptParserService = require('../services/ScriptParserService');
const AudioService = require('../services/TTS/audioService');
const RemotionService = require('../services/RemotionService');
const StorageService = require('../services/StorageService');
const GitHubService = require('../services/GitHubService');
const SocketService = require('../services/SocketService');
const ImageService = require('../services/ImageService');
const { JOB_STATUS } = require('../constants');

const connection = {
  host: config.redis.host,
  port: config.redis.port,
};

/**
 * Check if render output exists on disk for a job.
 */
async function renderExists(jobId) {
  const fs = require('fs').promises;
  const path = require('path');
  const renderPath = path.resolve(__dirname, '../../jobs', jobId, 'render', 'video.mp4');
  try {
    await fs.access(renderPath);
    return true;
  } catch {
    return false;
  }
}

/**
 * Video rendering worker.
 * Processes jobs from the BullMQ queue through the 9-step pipeline.
 * Never crashes - all errors are caught and logged.
 * Supports resuming from failed steps.
 */
const worker = new Worker(
  'video-rendering',
  async (job) => {
    const { jobId } = job.data;
    LoggerService.border(`🎬 Processing Job: ${jobId}`, 'event');

    // Get job details to check current state
    const videoJob = await VideoService.getById(jobId);
    const currentStatus = videoJob.status;

    // Determine script to use (existing or generate new)
    let script = videoJob.script;

    // Track the current step for error reporting
    let currentStep = null;

    try {
      // ── Step 1: Script Generation (only if starting fresh or restarting from QUEUED)
      if (!script?.scenes?.length || currentStatus === JOB_STATUS.QUEUED) {
        currentStep = JOB_STATUS.SCRIPT_GENERATION;
        await VideoService.updateStatus(jobId, JOB_STATUS.SCRIPT_GENERATION, { progress: 10 });
        SocketService.emitJobProgress({ _id: jobId, progress: 10, status: JOB_STATUS.SCRIPT_GENERATION, currentStep: JOB_STATUS.SCRIPT_GENERATION, currentScene: 0 });

        LoggerService.info('Starting script generation', { topic: videoJob.topic, type: videoJob.type });

        // ── Step 2: Render prompt template
        const prompt = PromptService.render(videoJob.type, {
          topic: videoJob.topic,
          language: videoJob.language,
          duration: '60',
        });

        // ── Step 3: Call LM Studio
        const rawScript = await LMStudioService.generateScript(prompt);
        // Pass the video type so ScriptParserService can assign default templates
        script = ScriptParserService.validate(rawScript, videoJob.type);

        // Save script to disk
        await ScriptParserService.saveScript(jobId, script);

        // Update job with script
        await VideoService.updateScript(jobId, script);
        SocketService.emitJobProgress({ _id: jobId, progress: 20, status: JOB_STATUS.SCRIPT_COMPLETED, currentStep: JOB_STATUS.SCRIPT_COMPLETED, currentScene: 0 });

        LoggerService.success('Script generated and saved', {
          title: script.title,
          scenes: script.scenes.length,
        });
      } else {
        LoggerService.info('Using existing script (skipping script generation)', {
          title: script.title,
          scenes: script.scenes.length,
          currentStatus,
        });
      }

      // ── Step 4: Audio Generation (skip if all scenes have audio)
      const scenesWithAudio = script.scenes.filter(s => s.audio?.file);
      const needsAudioGeneration = scenesWithAudio.length < script.scenes.length;

      if (needsAudioGeneration) {
        currentStep = JOB_STATUS.GENERATING_AUDIO;
        await VideoService.updateStatus(jobId, JOB_STATUS.GENERATING_AUDIO, { progress: 40 });
        SocketService.emitJobProgress({ _id: jobId, progress: 40, status: JOB_STATUS.GENERATING_AUDIO, currentStep: JOB_STATUS.GENERATING_AUDIO, currentScene: 0 });

        // Get scenes that need audio (those without audio file)
        const scenesToProcess = script.scenes.filter(s => !s.audio?.file);

        LoggerService.info('Generating audio for scenes', {
          totalScenes: script.scenes.length,
          alreadyGenerated: scenesWithAudio.length,
          pendingScenes: scenesToProcess.length,
        });

        const audioResults = await AudioService.generateAllAudio(jobId, scenesToProcess, videoJob.voice);

        // Update each scene with audio data
        for (const result of audioResults) {
          const sceneNum = parseInt(result.file.match(/\d+/)[0], 10);
          await VideoService.updateSceneAudio(jobId, sceneNum, result);
        }
      } else {
        LoggerService.info('All audio already generated, skipping audio step');
      }

      // Re-fetch the job from DB to get updated scene durations from audio generation
      const updatedJob = await VideoService.getById(jobId);
      script = updatedJob.script;

      await VideoService.updateStatus(jobId, JOB_STATUS.AUDIO_COMPLETED, { progress: 50 });
      SocketService.emitJobProgress({ _id: jobId, progress: 50, status: JOB_STATUS.AUDIO_COMPLETED, currentStep: JOB_STATUS.AUDIO_COMPLETED, currentScene: script.scenes.length });

      LoggerService.success('Audio generation complete', { files: script.scenes.length });

        // ── Step 5: Image Generation via ComfyUI
      // Only generate images for scenes with sceneType === "image"
      const imageScenes = script.scenes.filter(s => s.sceneType === 'image' && !s.imageUrl);
      const nonImageScenes = script.scenes.filter(s => s.sceneType !== 'image');

      if (imageScenes.length > 0) {
        currentStep = JOB_STATUS.GENERATING_IMAGES;
        await VideoService.updateStatus(jobId, JOB_STATUS.GENERATING_IMAGES, { progress: 55 });
        SocketService.emitJobProgress({ _id: jobId, progress: 55, status: JOB_STATUS.GENERATING_IMAGES, currentStep: JOB_STATUS.GENERATING_IMAGES, currentScene: 0 });

        LoggerService.info('Starting image generation via ComfyUI', {
          jobId,
          type: videoJob.type,
          totalScenes: script.scenes.length,
          imageScenes: imageScenes.length,
          skippedScenes: nonImageScenes.length,
        });

        // For podcast/business types with image scenes, generate a SINGLE background image used by all image scenes
        // For other types, generate per-scene images
        const isSingleImageType = ['podcast', 'business'].includes(videoJob.type);

        if (isSingleImageType && imageScenes.length > 0) {
          // Generate just ONE image from the first image scene's prompt, use as background for all images scenes
          LoggerService.info('Single-image mode: generating one background image for all image scenes', {
            jobId,
            type: videoJob.type,
          });
          const scenesWithImages = await ImageService.generateAllImages(jobId, imageScenes, { singleImage: true });

          // Update ALL image scenes with the same image URL
          for (const updatedScene of scenesWithImages) {
            await VideoService.updateSceneImage(jobId, updatedScene.sceneNumber, {
              imageUrl: updatedScene.imageUrl,
            });
          }
        } else {
          // Generate per-scene images for image scenes only
          const scenesWithImages = await ImageService.generateAllImages(jobId, imageScenes);

          // Update scenes with generated image URLs
          for (const updatedScene of scenesWithImages) {
            await VideoService.updateSceneImage(jobId, updatedScene.sceneNumber, {
              imageUrl: updatedScene.imageUrl,
            });
          }
        }

        // Re-fetch script with updated image URLs
        const jobWithImages = await VideoService.getById(jobId);
        script = jobWithImages.script;

        // Mark image generation complete
        await VideoService.updateStatus(jobId, JOB_STATUS.IMAGE_COMPLETED, { progress: 60 });
        SocketService.emitJobProgress({ _id: jobId, progress: 60, status: JOB_STATUS.IMAGE_COMPLETED, currentStep: JOB_STATUS.IMAGE_COMPLETED, currentScene: script.scenes.length });

        const scenesWithImageCount = script.scenes.filter(s => s.imageUrl).length;
        LoggerService.success('Image generation complete', {
          scenes: scenesWithImageCount,
          mode: isSingleImageType ? 'single' : 'per-scene',
        });
      } else {
        LoggerService.info('No image scenes found or all images generated, skipping image step');
      }

      // ── Step 6: Prepare Assets (always regenerate to include latest imageUrl and templateId)
      // Delete old assets.json if it exists to force regeneration with updated data
      const fs = require('fs').promises;
      const path = require('path');
      const oldAssetsPath = path.resolve(__dirname, '../../jobs', jobId, 'assets.json');
      try { await fs.unlink(oldAssetsPath); } catch {}

      currentStep = JOB_STATUS.PREPARING_ASSETS;
      await VideoService.updateStatus(jobId, JOB_STATUS.PREPARING_ASSETS, { progress: 70 });
      SocketService.emitJobProgress({ _id: jobId, progress: 70, status: JOB_STATUS.PREPARING_ASSETS, currentStep: JOB_STATUS.PREPARING_ASSETS, currentScene: 0 });

      const assetsPath = await RemotionService.prepareAssets(jobId, script, {
        resolution: videoJob.resolution,
        aspectRatio: videoJob.aspectRatio,
        type: videoJob.type,
      });

      LoggerService.success('Assets prepared', { path: assetsPath });

      // ── Step 7: Render Video (skip if already exists)
      const hasRender = await renderExists(jobId);
      if (!hasRender) {
        currentStep = JOB_STATUS.RENDERING;
        await VideoService.updateStatus(jobId, JOB_STATUS.RENDERING, { progress: 80 });
        SocketService.emitJobProgress({ _id: jobId, progress: 80, status: JOB_STATUS.RENDERING, currentStep: JOB_STATUS.RENDERING, currentScene: 0 });

        const renderResult = await RemotionService.renderVideo(jobId);

        LoggerService.success('Video rendered', renderResult);
      } else {
        LoggerService.info('Video already rendered, skipping');
      }

      // ── Step 8: Upload to GitHub
      currentStep = JOB_STATUS.UPLOADING;
      await VideoService.updateStatus(jobId, JOB_STATUS.UPLOADING, { progress: 95 });
      SocketService.emitJobProgress({ _id: jobId, progress: 95, status: JOB_STATUS.UPLOADING, currentStep: JOB_STATUS.UPLOADING, currentScene: 0 });

      const uploadFiles = await StorageService.getUploadFiles(jobId);
      const uploaded = await GitHubService.uploadJobAssets(jobId, uploadFiles);

      LoggerService.success('Upload complete', {
        script: uploaded.script?.length || 0,
        audio: uploaded.audio?.length || 0,
        render: uploaded.render?.length || 0,
      });

      // ── Step 9: Complete Job
      const completedJob = await VideoService.complete(jobId, {
        videoUrl: uploaded.render?.[0] || '',
        thumbnailUrl: uploaded.render?.[1] || '',
        scriptUrl: uploaded.script?.[0] || '',
        audioUrls: uploaded.audio || [],
        assetsUrl: uploaded.script?.[1] || '',
      });

      SocketService.emitJobCompleted(completedJob);

      LoggerService.border(`✅ Job Complete: ${jobId}`, 'success');
      LoggerService.success('Video generation pipeline finished', {
        jobId,
        videoUrl: completedJob.videoUrl,
      });

      // Cleanup local files
      await StorageService.cleanupJob(jobId);

      return { success: true, jobId };
    } catch (err) {
      LoggerService.error(`Job ${jobId} failed`, {
        error: err.message,
        step: currentStep,
        stack: config.isDev ? err.stack : undefined,
      });

      // Mark job as failed in database with the actual step
      try {
        const failedJob = await VideoService.fail(jobId, err.message, currentStep || 'PROCESSING');
        SocketService.emitJobFailed(failedJob, err.message);
      } catch (dbErr) {
        LoggerService.error('Failed to update job status in DB', { error: dbErr.message });
      }

      // Re-throw so BullMQ can handle retries
      throw err;
    }
  },
  {
    connection,
    concurrency: 3, // Process up to 3 jobs concurrently
    lockDuration: 600_000, // 10 minutes - extended to cover long video pipelines
    limiter: {
      max: 10, // Max 10 jobs per second
      duration: 1000,
    },
  }
);

worker.on('completed', (job) => {
  LoggerService.info(`Worker completed job ${job.id}`);
});

worker.on('failed', (job, err) => {
  LoggerService.error(`Worker failed job ${job.id}`, { error: err.message });
});

worker.on('error', (err) => {
  LoggerService.error('Worker error', { error: err.message });
});

LoggerService.border('🎥 Video Worker Started', 'event');
LoggerService.info('Worker listening for jobs', {
  queue: 'video-rendering',
  concurrency: 3,
  redis: `${config.redis.host}:${config.redis.port}`,
});

module.exports = worker;