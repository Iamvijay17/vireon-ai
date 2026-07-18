const { Queue } = require('bullmq');
const config = require('../config');
const LoggerService = require('../services/LoggerService');

const connection = {
  host: config.redis.host,
  port: config.redis.port,
};

const courseQueue = new Queue('course-video-processing', {
  connection,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 5000,
    },
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