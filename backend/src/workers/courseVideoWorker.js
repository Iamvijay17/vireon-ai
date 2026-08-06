const { Worker } = require('bullmq');
const mongoose = require('mongoose');
const config = require('../config');
const LoggerService = require('../services/LoggerService');
const CourseVideoService = require('../services/CourseVideoService');
const SocketService = require('../services/SocketService');
const StorageService = require('../services/StorageService');

// See videoWorker.js's identical handlers for why this process needs them
// (it shares the same AudioService, which is where the unhandled-rejection
// risk actually comes from).
process.on('uncaughtException', (err) => {
  LoggerService.error('Course video worker uncaught exception', { error: err.message, stack: err.stack });
  process.exit(1);
});

process.on('unhandledRejection', (reason) => {
  LoggerService.error('Course video worker unhandled rejection', { reason: reason?.message || reason });
});

// Connect to MongoDB on worker startup
mongoose.connect(config.mongodb.uri, {
  serverSelectionTimeoutMS: 5000,
  heartbeatFrequencyMS: 10000,
}).then(() => {
  LoggerService.success('Course Video Worker MongoDB connected successfully');
}).catch((err) => {
  LoggerService.error('Course Video Worker MongoDB connection failed', { error: err.message });
  process.exit(1);
});

// Initialize Redis pub/sub for cross-process socket communication
SocketService.initRedis();

const connection = {
  host: config.redis.host,
  port: config.redis.port,
};

/**
 * Check if render output exists on disk for a course video job.
 */
async function renderExists(videoId) {
  const fs = require('fs').promises;
  const path = require('path');
  const renderPath = path.resolve(__dirname, '../../jobs', videoId, 'render', 'video.mp4');
  try {
    await fs.access(renderPath);
    return true;
  } catch {
    return false;
  }
}

/**
 * Course Video Worker - processes course video generation jobs.
 * Runs as a separate process from the API server.
 * All logs here go to the worker process, not the API process.
 */
const courseVideoWorker = new Worker(
  'course-video-processing',
  async (job) => {
    const { videoId, action } = job.data;

    LoggerService.border(`🎬 Processing Course Video: ${videoId}`, 'event');
    LoggerService.info(`Worker processing course video ${action}`, {
      jobId: job.id,
      videoId,
      action,
    });

    try {
      switch (action) {
        case 'generate-script':
          await CourseVideoService.generateScript(videoId);
          break;
        case 'regenerate-script':
          await CourseVideoService.regenerateScript(videoId);
          break;
        case 'generate-audio':
          await CourseVideoService.generateAudio(videoId);
          break;
        case 'render':
          await CourseVideoService.renderVideo(videoId);
          break;
        case 'retry':
          await CourseVideoService.retryStep(videoId);
          break;
        default:
          throw new Error(`Unknown action: ${action}`);
      }

      LoggerService.success(`Worker completed course video ${action}`, {
        jobId: job.id,
        videoId,
      });
    } catch (err) {
      // A cancelled video's status/stage fields were already set to
      // CANCELLED by CourseVideoService.stop() the moment the user hit
      // Stop - don't overwrite that with FAILED, and don't let BullMQ treat
      // this as a failed job (no retry, no "failed" listener alarm).
      if (err.cancelled) {
        LoggerService.info('Course video job stopped by user', { jobId: job.id, videoId, action });
        return { success: false, videoId, cancelled: true };
      }

      LoggerService.error('Course video job processing failed', {
        error: err.message,
        videoId,
        action,
        stack: config.isDev ? err.stack : undefined,
      });

      // Every action above (generateScript/generateAudio/renderVideo, and
      // retryStep by delegating to one of those) already sets
      // video.status/error to a human-readable step label ('Script
      // Generation', 'Audio Generation', ...) and emits
      // emitCourseVideoFailed from its own try/catch before rethrowing -
      // that's what retryStep()'s switch matches against. Duplicating that
      // write here with the raw action slug (e.g. 'generate-audio') would
      // silently break Retry (falls through to the switch's default case)
      // and double-count retryCount, so this is now just a safety-net log
      // for the case a video record couldn't be found/loaded at all.
      try {
        const video = await CourseVideoService.getById(videoId);
        if (!video) {
          LoggerService.error('Course video not found while handling job failure', { videoId, action });
        }
      } catch (dbErr) {
        LoggerService.error('Failed to load course video after job failure', { error: dbErr.message });
      }

      throw err;
    }
  },
  {
    connection,
    // Strict sequential processing: bulk actions from the lesson table rely
    // on this being 1 so one lesson's job fully completes before the next
    // starts (also what makes 'generate-full' correctly chain script ->
    // audio -> render for a single video without a dedicated composite action).
    concurrency: 1,
    // See videoWorker.js's identical setting for why this is 5 minutes, not
    // 60 - BullMQ auto-renews the lock while the process is alive, so a
    // long render doesn't need a long lockDuration. It only bounds how long
    // a crashed worker's abandoned lock blocks reclaiming the job.
    lockDuration: 300_000,
    stalledInterval: 60_000,  // Check for stalled jobs every 60 seconds
    maxStalledCount: 3,       // Allow up to 3 stalled checks before failing
    limiter: {
      max: 5, // Max 5 jobs per second
      duration: 1000,
    },
  }
);

courseVideoWorker.on('completed', (job) => {
  LoggerService.info(`Worker completed job ${job.id}`, { action: job.data.action });
});

courseVideoWorker.on('failed', (job, err) => {
  LoggerService.error(`Worker failed job ${job.id}`, {
    error: err.message,
    videoId: job.data.videoId,
    action: job.data.action,
  });
});

courseVideoWorker.on('error', (err) => {
  LoggerService.error('Course video worker error', { error: err.message });
});

// See videoWorker.js's identical handler - logs when a crashed worker's
// abandoned job gets reclaimed, so a recurring pattern is visible.
courseVideoWorker.on('stalled', (jobId) => {
  LoggerService.warn(`Job ${jobId} stalled - its worker likely crashed mid-processing, reclaiming for reprocessing`);
});

LoggerService.border('🎥 Course Video Worker Started', 'event');
LoggerService.info('Worker listening for jobs', {
  queue: 'course-video-processing',
  concurrency: 1,
  redis: `${config.redis.host}:${config.redis.port}`,
});

module.exports = courseVideoWorker;
