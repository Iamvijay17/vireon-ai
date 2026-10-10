const YouTubeApi = require('./youtube/YouTubeApi');
const YouTubeAuthService = require('./youtube/YouTubeAuthService');
const PublishingService = require('./PublishingService');
const PublishingJobStore = require('./PublishingJobStore');

/**
 * The process-wide publishing singletons (API server and workers each get
 * their own copy). Built on first use so that merely requiring the module -
 * e.g. from a test or the route table - does not construct a storage client
 * or open a Redis connection.
 */
let runtime = null;

function getRuntime() {
  if (!runtime) {
    const { getQueue } = require('../../queues/publishingQueues');
    const api = new YouTubeApi();
    const auth = new YouTubeAuthService({ api });
    const store = new PublishingJobStore();
    const service = new PublishingService({ auth, queues: getQueue, store });
    runtime = { api, auth, store, service };
  }
  return runtime;
}

module.exports = { getRuntime };
