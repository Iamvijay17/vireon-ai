const { Worker } = require('bullmq');
const mongoose = require('mongoose');
const config = require('../config');
const LoggerService = require('../services/common/LoggerService');

// Fire-and-forget: spawns a local redis-server if REDIS_HOST is localhost
// and nothing's listening there yet, so the queue connection below doesn't
// spend the next several minutes retrying against a dead port.
require('../utils/ensureRedis')();

const CourseVideoService = require('../services/course/CourseVideoService');
const SocketService = require('../services/common/SocketService');
const StorageService = require('../services/storage/StorageService');
const courseQueue = require('../queues/courseQueue');
const { computeBackoffMs } = require('../utils/backoff');
const ActivityLogService = require('../services/common/ActivityLogService');

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
      // A delayed automatic-retry job (see the outer catch below) can fire
      // after the user already hit Stop while it was waiting - bail before
      // touching the pipeline instead of re-running against a CANCELLED video.
      await CourseVideoService.bailIfCancelled(videoId);

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
      // and double-count retryCount, so this stays a safety-net for a
      // missing video record plus the one place that decides whether to
      // automatically retry (the pipeline module already incremented
      // error.retryCount before rethrowing, so this just reads it back).
      try {
        const video = await CourseVideoService.getById(videoId);
        if (!video) {
          LoggerService.error('Course video not found while handling job failure', { videoId, action });
        }

        const attempt = video?.error?.retryCount || 0;
        const maxRetries = video?.maxRetries || 3;
        // retryStep re-runs the same failed action from a clean slate and
        // shouldn't itself trigger another automatic retry loop - only the
        // original generate-script/generate-audio/render actions do.
        const isAutoRetryable = !!video && attempt > 0 && attempt <= maxRetries && action !== 'retry';

        if (isAutoRetryable) {
          const delay = computeBackoffMs(attempt);
          const nextRetryAt = new Date(Date.now() + delay);
          await CourseVideoService.scheduleRetry(videoId, { nextRetryAt });
          await ActivityLogService.add(
            videoId,
            `${video.error?.step || action} failed (attempt ${attempt}/${maxRetries}) - retrying in ${Math.round(delay / 1000)}s`
          );
          await courseQueue.add(action, { videoId, action }, { jobId: `${videoId}:retry:${attempt}`, delay });
          LoggerService.info('Course video job scheduled for automatic retry', { videoId, action, attempt, delay });
          return { success: false, videoId, retryScheduled: true, attempt };
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

// See videoWorker.js's identical handler for the rationale (stop taking new
// jobs, let active ones finish, force-exit after 30s if that hangs).
let shuttingDown = false;
async function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  LoggerService.info(`Course video worker received ${signal} - closing gracefully, waiting for active jobs...`);

  const forceExit = setTimeout(() => {
    LoggerService.warn('Course video worker graceful shutdown timed out after 30s, forcing exit');
    process.exit(1);
  }, 30_000);

  try {
    await courseVideoWorker.close();
    clearTimeout(forceExit);
    await mongoose.connection.close();
    LoggerService.info('Course video worker shut down gracefully');
    process.exit(0);
  } catch (err) {
    clearTimeout(forceExit);
    LoggerService.error('Error during course video worker graceful shutdown', { error: err.message });
    process.exit(1);
  }
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

LoggerService.border('🎥 Course Video Worker Started', 'event');
LoggerService.info('Worker listening for jobs', {
  queue: 'course-video-processing',
  concurrency: 1,
  redis: `${config.redis.host}:${config.redis.port}`,
});

module.exports = courseVideoWorker;
