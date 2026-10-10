const MetaApi = require('./MetaApi');
const ThreadsApi = require('./ThreadsApi');
const SocialAuthService = require('./SocialAuthService');
const SocialService = require('./SocialService');
const SocialPostStore = require('./SocialPostStore');

/**
 * The process-wide social singletons (API server and worker each get their
 * own copy). Built on first use so that merely requiring the module - from a
 * test or the route table - does not construct a storage client or open a
 * Redis connection.
 */
let runtime = null;

function getRuntime() {
  if (!runtime) {
    const { getQueue } = require('../../queues/publishingQueues');
    const apis = { meta: new MetaApi(), threads: new ThreadsApi() };
    const auth = new SocialAuthService({ meta: apis.meta, threads: apis.threads });
    const store = new SocialPostStore();
    const service = new SocialService({ auth, apis, queues: getQueue, store });
    runtime = { apis, auth, store, service };
  }
  return runtime;
}

module.exports = { getRuntime };
