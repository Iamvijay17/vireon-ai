const { Queue } = require('bullmq');
const config = require('../config');
const LoggerService = require('../services/common/LoggerService');

const connection = {
  host: config.redis.host,
  port: config.redis.port,
};

const videoQueue = new Queue('video-rendering', {
  connection,
  defaultJobOptions: {
    // BullMQ's own retry was fighting the app's manual retry flow: on
    // failure, VideoService.fail() marks the job FAILED in Mongo and the
    // worker re-throws "so BullMQ can handle retries" - but BullMQ then
    // silently re-queues the same job in the background (up to 2 more
    // times, with backoff), holding it in a BullMQ 'active'/'delayed'
    // state for up to ~35s even though the DB already says FAILED. Every
    // manual-recovery endpoint (restart, regenerate-script) checks
    // getState() === 'active' and rejects with "Job is still actively
    // being processed" during that window, even though nothing in the UI
    // suggests the job is still running. Recovery here is already fully
    // handled at the app level (VideoService.restart/regenerateScript,
    // retryCount/maxRetries on the job document, and the Restart Job /
    // Regenerate Script buttons) - BullMQ doesn't need its own retry on
    // top of that, so let it fail on the first attempt.
    attempts: 1,
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
