const { Worker } = require('bullmq');
const config = require('../config');
const LoggerService = require('../services/LoggerService');
const CourseVideoService = require('../services/CourseVideoService');

const connection = {
  host: config.redis.host,
  port: config.redis.port,
};

/**
 * Course Video Worker - processes course video generation jobs.
 * Runs as a separate process from the API server.
 * All logs here go to the worker process, not the API process.
 */
const courseVideoWorker = new Worker(
  'course-video-processing',
  async (job) => {
    const { videoId, action } = job.data;

    LoggerService.info(`Worker processing course video ${action}`, {
      jobId: job.id,
      videoId,
      action,
    });

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

    LoggerService.info(`Worker completed course video ${action}`, {
      jobId: job.id,
      videoId,
    });
  },
  {
    connection,
    concurrency: 2,
    limiter: {
      max: 5,
      duration: 1000,
    },
  }
);

courseVideoWorker.on('completed', (job) => {
  LoggerService.debug(`Worker job completed: ${job.id}`);
});

courseVideoWorker.on('failed', (job, err) => {
  LoggerService.error(`Worker job failed: ${job.id}`, {
    error: err.message,
    videoId: job.data.videoId,
    action: job.data.action,
  });
});

courseVideoWorker.on('error', (err) => {
  LoggerService.error('Course video worker error', { error: err.message });
});

LoggerService.info('Course video worker initialized', {
  host: config.redis.host,
  port: config.redis.port,
});

module.exports = courseVideoWorker;

// ─── Start worker if run directly ─────────────────────────────────────────────
if (require.main === module) {
  const { connectDatabase } = require('../config/database');
  connectDatabase()
    .then(() => {
      LoggerService.info('Course video worker started and ready for jobs');
    })
    .catch((err) => {
      LoggerService.error('Failed to start course video worker', { error: err.message });
      process.exit(1);
    });
}