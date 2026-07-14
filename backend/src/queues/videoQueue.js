const { Queue } = require('bullmq');
const config = require('../config');
const LoggerService = require('../services/LoggerService');

const connection = {
  host: config.redis.host,
  port: config.redis.port,
};

const videoQueue = new Queue('video-rendering', {
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

videoQueue.on('error', (err) => {
  LoggerService.error('BullMQ Queue error', { error: err });
});

LoggerService.info('BullMQ video queue initialized', {
  host: config.redis.host,
  port: config.redis.port,
});

module.exports = videoQueue;
