const { startPublishingWorker } = require('./publishingWorkerBase');
const { QUEUE_NAMES } = require('../queues/publishingQueues');
const { getRuntime } = require('../services/publishing');
const { processYouTubeJob } = require('../services/publishing/youtube/processYouTubeJob');
const { getStorageProvider } = require('../services/storage/providers');
const { PUBLISH_PLATFORM } = require('../constants');

/**
 * YouTube publishing worker: `npm run youtube-worker`.
 * Consumes the `youtube-publishing` queue - one resumable upload at a time by
 * default (YOUTUBE_WORKER_CONCURRENCY), since uploads are bandwidth-bound and
 * share one daily API allowance.
 */
const concurrency = parseInt(process.env.YOUTUBE_WORKER_CONCURRENCY, 10) || 1;

const worker = startPublishingWorker({
  role: 'youtube',
  queueName: QUEUE_NAMES.youtube,
  platform: PUBLISH_PLATFORM.YOUTUBE,
  concurrency,
  buildProcessor: ({ workerId }) => {
    const { api, auth, store, service } = getRuntime();
    const enqueue = (job, opts) => service.enqueue(job, opts);
    return (jobId) => processYouTubeJob(jobId, { store, api, auth, storage: getStorageProvider(), enqueue, workerId });
  },
  enqueueFor: () => (job, opts) => getRuntime().service.enqueue(job, opts),
});

module.exports = worker;
