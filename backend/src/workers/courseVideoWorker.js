const { Worker } = require('bullmq');
const mongoose = require('mongoose');
const config = require('../config');
const LoggerService = require('../services/LoggerService');
const CourseVideoService = require('../services/CourseVideoService');
const SocketService = require('../services/SocketService');
const StorageService = require('../services/StorageService');
const { VIDEO_STATUS } = require('../constants');

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
      LoggerService.error('Course video job processing failed', {
        error: err.message,
        videoId,
        action,
        stack: config.isDev ? err.stack : undefined,
      });

       // Try to update job status to failed and emit socket event
      try {
        const video = await CourseVideoService.getById(videoId);
        if (video) {
          video.status = VIDEO_STATUS.FAILED;
          video.error = {
            message: err.message,
            step: action,
            retryCount: (video.error?.retryCount || 0) + 1,
          };
          await video.save();
          SocketService.emitCourseVideoFailed(video, err.message, action);
        }
      } catch (dbErr) {
        LoggerService.error('Failed to update course video job status in DB', { error: dbErr.message });
      }

      throw err;
    }
  },
  {
    connection,
    concurrency: 2,
    lockDuration: 3_600_000, // 60 minutes - video rendering can take a long time
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

LoggerService.border('🎥 Course Video Worker Started', 'event');
LoggerService.info('Worker listening for jobs', {
  queue: 'course-video-processing',
  concurrency: 2,
  redis: `${config.redis.host}:${config.redis.port}`,
});

module.exports = courseVideoWorker;
