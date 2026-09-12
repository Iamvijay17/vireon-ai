const { Queue } = require('bullmq');
const config = require('../config');
const LoggerService = require('../services/common/LoggerService');

const connection = {
  host: config.redis.host,
  port: config.redis.port,
};

const courseQueue = new Queue('course-video-processing', {
  connection,
  defaultJobOptions: {
    // BullMQ's own retry would race the app-level one now handled in
    // courseVideoWorker.js's outer catch (retryCount/maxRetries on the
    // CourseVideo document, scheduleRetry + a fresh delayed job) - see
    // videoQueue.js's comment for the exact race this avoids (BullMQ
    // silently re-queuing while Mongo already reflects a different state).
    attempts: 1,
    removeOnComplete: {
      age: 24 * 3600, // Keep completed jobs for 24 hours
    },
    removeOnFail: {
      age: 7 * 24 * 3600, // Keep failed jobs for 7 days
    },
  },
});

courseQueue.on('error', (err) => {
  LoggerService.error('BullMQ Course Queue error', { error: err });
});

LoggerService.info('BullMQ course queue initialized', {
  host: config.redis.host,
  port: config.redis.port,
});

module.exports = courseQueue;