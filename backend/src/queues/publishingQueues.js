const { Queue } = require('bullmq');
const config = require('../config');
const LoggerService = require('../services/common/LoggerService');

/**
 * Publishing queues - one per kind of work, each consumed by its own worker
 * process (workers/youtubePublishWorker.js, workers/courseExportWorker.js):
 *
 *   youtube-publishing  long, network-bound resumable uploads
 *   course-export       CPU/disk-bound Udemy package builds
 *
 * Kept apart so a multi-gigabyte upload never queues behind a ZIP build or
 * the other way round, and so either worker can be stopped independently.
 *
 * `attempts: 1` is deliberate and matches the video/course queues: retries
 * are owned by the application (PublishingJob.attempts + backoff, persisted),
 * because BullMQ's own retry would run alongside it and re-run a job whose
 * Mongo state already says something else.
 *
 * Created lazily - requiring this file must not open a Redis socket, so the
 * API process and tests only pay for it when something is actually queued.
 */

const connection = () => ({ host: config.redis.host, port: config.redis.port });

const QUEUE_NAMES = Object.freeze({
  youtube: 'youtube-publishing',
  export: 'course-export',
  // Promotion Studio posts (Facebook / Instagram / Threads), incl. scheduled ones as delayed jobs.
  social: 'social-publishing',
});

const queues = {};

function create(name) {
  const queue = new Queue(name, {
    connection: connection(),
    defaultJobOptions: {
      attempts: 1,
      removeOnComplete: { age: 24 * 3600 },
      removeOnFail: { age: 7 * 24 * 3600 },
    },
  });
  queue.on('error', (err) => LoggerService.error('BullMQ publishing queue error', { queue: name, error: err.message }));
  return queue;
}

function getQueue(kind) {
  if (!QUEUE_NAMES[kind]) throw new Error(`Unknown publishing queue: ${kind}`);
  if (!queues[kind]) queues[kind] = create(QUEUE_NAMES[kind]);
  return queues[kind];
}

module.exports = { getQueue, QUEUE_NAMES, connection };
