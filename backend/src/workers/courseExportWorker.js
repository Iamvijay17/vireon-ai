const { startPublishingWorker } = require('./publishingWorkerBase');
const { QUEUE_NAMES } = require('../queues/publishingQueues');
const { getRuntime } = require('../services/publishing');
const { processExportJob } = require('../services/publishing/udemy/processExportJob');
const { loadCourseData } = require('../services/publishing/udemy/courseData');
const { getStorageProvider } = require('../services/storage/providers');
const { PUBLISH_PLATFORM } = require('../constants');

/**
 * Course export worker: `npm run export-worker`.
 * Consumes the `course-export` queue and builds Udemy-ready packages (ZIP with
 * manifest, organised videos, captions, validation report and checklist).
 * One build at a time - it streams large files and writes a temp ZIP.
 */
const worker = startPublishingWorker({
  role: 'export',
  queueName: QUEUE_NAMES.export,
  platform: PUBLISH_PLATFORM.UDEMY_EXPORT,
  concurrency: 1,
  buildProcessor: ({ workerId }) => {
    const { store, service } = getRuntime();
    const enqueue = (job, opts) => service.enqueue(job, opts);
    return (jobId) => processExportJob(jobId, { store, storage: getStorageProvider(), enqueue, workerId, loadData: loadCourseData });
  },
  enqueueFor: () => (job, opts) => getRuntime().service.enqueue(job, opts),
});

module.exports = worker;
