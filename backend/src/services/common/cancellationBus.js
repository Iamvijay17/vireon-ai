const Redis = require('ioredis');
const config = require('../../config');
const LoggerService = require('./LoggerService');

// Separate from REDIS_CHANNEL (constants/index.js) - that one fans out to
// Socket.IO clients via socketService/redisBridge.js's forwardEvent switch,
// which isn't relevant here and would just log "Unknown event type" for a
// message type it doesn't handle.
const CANCEL_CHANNEL = 'vireon:job-cancel';

// jobId -> Set<AbortController>. A job can have more than one cancelable
// operation registered for it if a future caller wants finer-grained scope
// than "the whole job's current step" - Set so all of them abort together.
const controllers = new Map();

let publisher = null;
let subscriber = null;
let subscribed = false;

function getPublisher() {
  if (!publisher) {
    publisher = new Redis({ host: config.redis.host, port: config.redis.port, maxRetriesPerRequest: null });
  }
  return publisher;
}

function abortLocal(jobId) {
  const set = controllers.get(jobId);
  if (!set || set.size === 0) return;
  for (const controller of set) {
    controller.abort();
  }
}

/**
 * Call once, in any process that will register cancelable work (currently
 * just the video worker). Subscribes to the cancel channel so a stop()
 * request published from a *different* process (typically the API server)
 * still reaches this process's in-flight AbortControllers - stop() and the
 * actual TTS/render call almost never run in the same process.
 */
function listenForCancellation() {
  if (subscribed) return;
  subscribed = true;

  subscriber = new Redis({ host: config.redis.host, port: config.redis.port, maxRetriesPerRequest: null });
  subscriber.subscribe(CANCEL_CHANNEL, (err) => {
    if (err) {
      LoggerService.error('Failed to subscribe to job-cancel channel', { error: err.message });
    }
  });
  subscriber.on('message', (channel, jobId) => {
    if (channel !== CANCEL_CHANNEL) return;
    abortLocal(jobId);
  });
}

/**
 * Register an AbortController as belonging to jobId's currently-running
 * work, so a cancel request (local or from another process) aborts it
 * immediately instead of only being noticed at the next step/scene
 * boundary (see workers/videoWorker/shared.js's bailIfCancelled). Returns
 * an unregister function - callers must invoke it once their operation
 * settles (cancelled or not) so the registry doesn't accumulate stale
 * controllers for long-since-finished jobs.
 */
function register(jobId, controller) {
  let set = controllers.get(jobId);
  if (!set) {
    set = new Set();
    controllers.set(jobId, set);
  }
  set.add(controller);

  return () => {
    set.delete(controller);
    if (set.size === 0) controllers.delete(jobId);
  };
}

/**
 * Request cancellation of jobId's in-flight work. Aborts any controller
 * registered in this process immediately, and publishes to Redis so a
 * worker process elsewhere picks it up too - the common case, since stop()
 * is called from the API server's request handler while the actual
 * TTS/render call is running in the separate videoWorker process.
 */
function requestCancel(jobId) {
  abortLocal(jobId);
  getPublisher().publish(CANCEL_CHANNEL, jobId).catch((err) => {
    LoggerService.error('Failed to publish job cancellation', { jobId, error: err.message });
  });
}

module.exports = { listenForCancellation, register, requestCancel };
