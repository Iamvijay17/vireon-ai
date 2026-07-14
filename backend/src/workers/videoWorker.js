const { Worker } = require('bullmq');
const mongoose = require('mongoose');
const config = require('../config');
const LoggerService = require('../services/LoggerService');
const VideoService = require('../services/VideoService');
const PromptService = require('../services/PromptService');
const LMStudioService = require('../services/LMStudioService');
const ScriptParserService = require('../services/ScriptParserService');
const AudioService = require('../services/TTS/audioService');
const RemotionService = require('../services/RemotionService');
const StorageService = require('../services/StorageService');
const GitHubService = require('../services/GitHubService');
const SocketService = require('../services/SocketService');
const { JOB_STATUS } = require('../constants');

const connection = {
  host: config.redis.host,
  port: config.redis.port,
};

/**
 * Video rendering worker.
 * Processes jobs from the BullMQ queue through the 8-step pipeline.
 * Never crashes - all errors are caught and logged.
 */
const worker = new Worker(
  'video-rendering',
  async (job) => {
    const { jobId } = job.data;
    LoggerService.border(`🎬 Processing Job: ${jobId}`, 'event');

    try {
      // ── Step 1: Update status to SCRIPT_GENERATION ──────────────────────
      await VideoService.updateStatus(jobId, JOB_STATUS.SCRIPT_GENERATION, { progress: 10 });
      SocketService.emitJobProgress({ _id: jobId, progress: 10, status: JOB_STATUS.SCRIPT_GENERATION, currentStep: JOB_STATUS.SCRIPT_GENERATION, currentScene: 0 });

      // Get job details
      const videoJob = await VideoService.getById(jobId);
      LoggerService.info('Step 1: Starting script generation', { topic: videoJob.topic, type: videoJob.type });

      // ── Step 2: Render prompt template ──────────────────────────────────
      const prompt = PromptService.render(videoJob.type, {
        topic: videoJob.topic,
        language: videoJob.language,
        duration: '60',
      });

      // ── Step 3: Call LM Studio ──────────────────────────────────────────
      const rawScript = await LMStudioService.generateScript(prompt);
      const validatedScript = ScriptParserService.validate(rawScript);

      // Save script to disk
      await ScriptParserService.saveScript(jobId, validatedScript);

      // Update job with script
      await VideoService.updateScript(jobId, validatedScript);
      SocketService.emitJobProgress({ _id: jobId, progress: 20, status: JOB_STATUS.SCRIPT_COMPLETED, currentStep: JOB_STATUS.SCRIPT_COMPLETED, currentScene: 0 });

      LoggerService.success('Step 3: Script generated and saved', {
        title: validatedScript.title,
        scenes: validatedScript.scenes.length,
      });

      // ── Step 4: Generate Audio ──────────────────────────────────────────
      await VideoService.updateStatus(jobId, JOB_STATUS.GENERATING_AUDIO, { progress: 40 });
      SocketService.emitJobProgress({ _id: jobId, progress: 40, status: JOB_STATUS.GENERATING_AUDIO, currentStep: JOB_STATUS.GENERATING_AUDIO, currentScene: 0 });

      const audioResults = await AudioService.generateAllAudio(jobId, validatedScript.scenes, videoJob.voice);

      // Update each scene with audio data
      for (const result of audioResults) {
        const sceneNum = parseInt(result.file.match(/\d+/)[0], 10);
        await VideoService.updateSceneAudio(jobId, sceneNum, result);
      }

      await VideoService.updateStatus(jobId, JOB_STATUS.AUDIO_COMPLETED, { progress: 50 });
      SocketService.emitJobProgress({ _id: jobId, progress: 50, status: JOB_STATUS.AUDIO_COMPLETED, currentStep: JOB_STATUS.AUDIO_COMPLETED, currentScene: audioResults.length });

      LoggerService.success('Step 4: Audio generation complete', { files: audioResults.length });

      // ── Step 5: Prepare Assets ──────────────────────────────────────────
      await VideoService.updateStatus(jobId, JOB_STATUS.PREPARING_ASSETS, { progress: 60 });
      SocketService.emitJobProgress({ _id: jobId, progress: 60, status: JOB_STATUS.PREPARING_ASSETS, currentStep: JOB_STATUS.PREPARING_ASSETS, currentScene: 0 });

      const assetsPath = await RemotionService.prepareAssets(jobId, validatedScript, {
        resolution: videoJob.resolution,
        aspectRatio: videoJob.aspectRatio,
        type: videoJob.type,
      });

      LoggerService.success('Step 5: Assets prepared', { path: assetsPath });

      // ── Step 6: Render Video ────────────────────────────────────────────
      await VideoService.updateStatus(jobId, JOB_STATUS.RENDERING, { progress: 80 });
      SocketService.emitJobProgress({ _id: jobId, progress: 80, status: JOB_STATUS.RENDERING, currentStep: JOB_STATUS.RENDERING, currentScene: 0 });

      const renderResult = await RemotionService.renderVideo(jobId);

      LoggerService.success('Step 6: Video rendered', renderResult);

      // ── Step 7: Upload to GitHub ────────────────────────────────────────
      await VideoService.updateStatus(jobId, JOB_STATUS.UPLOADING, { progress: 90 });
      SocketService.emitJobProgress({ _id: jobId, progress: 90, status: JOB_STATUS.UPLOADING, currentStep: JOB_STATUS.UPLOADING, currentScene: 0 });

      const uploadFiles = await StorageService.getUploadFiles(jobId);
      const uploaded = await GitHubService.uploadJobAssets(jobId, uploadFiles);

      LoggerService.success('Step 7: Upload complete', {
        script: uploaded.script?.length || 0,
        audio: uploaded.audio?.length || 0,
        render: uploaded.render?.length || 0,
      });

      // ── Step 8: Complete Job ────────────────────────────────────────────
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
        stack: config.isDev ? err.stack : undefined,
      });

      // Mark job as failed in database
      try {
        const failedJob = await VideoService.fail(jobId, err.message, 'PROCESSING');
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
