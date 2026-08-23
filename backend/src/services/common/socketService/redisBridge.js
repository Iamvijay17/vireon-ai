const Redis = require('ioredis');
const config = require('../../../config');
const LoggerService = require('../LoggerService');
const { SOCKET_EVENTS, REDIS_CHANNEL, REDIS_LOG_BUFFER_KEY } = require('../../../constants');
const { state, LOG_BUFFER_MAX } = require('./state');
const { emitToJob } = require('./coreEmit');

/**
 * Append a server log entry to the Redis-backed ring buffer, trimmed to
 * LOG_BUFFER_MAX. Only the main server process calls this (from
 * forwardEvent, after receiving the event over Redis pub/sub), so there's
 * a single writer and no cross-process race on the trim.
 */
function persistLog(data) {
  if (!state.redisPublisher) return;
  state.redisPublisher
    .multi()
    .rpush(REDIS_LOG_BUFFER_KEY, JSON.stringify(data))
    .ltrim(REDIS_LOG_BUFFER_KEY, -LOG_BUFFER_MAX, -1)
    .exec()
    .catch((err) => {
      LoggerService.error('Failed to persist log entry to Redis', { error: err.message });
    });
}

/**
 * Forward an event received from Redis pub/sub to Socket.IO clients.
 */
function forwardEvent(event) {
  if (!state.io) return;

  const { type, jobId, courseId, data } = event;

  switch (type) {
    case 'jobProgress':
      emitToJob(jobId, SOCKET_EVENTS.JOB_PROGRESS, data);
      break;
    case 'jobCompleted':
      emitToJob(jobId, SOCKET_EVENTS.JOB_COMPLETED, data);
      break;
    case 'jobFailed':
      emitToJob(jobId, SOCKET_EVENTS.JOB_FAILED, data);
      break;
    case 'sceneAudioReady':
      emitToJob(jobId, SOCKET_EVENTS.SCENE_AUDIO_READY, data);
      break;
    case 'jobCreated':
      state.io.emit(SOCKET_EVENTS.JOB_CREATED, data);
      break;
    case 'serverLog':
      persistLog(data);
      state.io.emit(SOCKET_EVENTS.SERVER_LOG, data);
      break;
    // Course video events
    case 'courseVideoProgress':
      if (courseId) {
        state.io.to(`course:${courseId}`).emit(SOCKET_EVENTS.COURSE_VIDEO_PROGRESS, data);
      }
      break;
    case 'courseVideoScriptReady':
      if (courseId) {
        state.io.to(`course:${courseId}`).emit(SOCKET_EVENTS.COURSE_VIDEO_SCRIPT_READY, data);
      }
      break;
    case 'courseVideoAudioReady':
      if (courseId) {
        state.io.to(`course:${courseId}`).emit(SOCKET_EVENTS.COURSE_VIDEO_AUDIO_READY, data);
      }
      break;
    case 'courseVideoSceneAudioReady':
      if (courseId) {
        state.io.to(`course:${courseId}`).emit(SOCKET_EVENTS.COURSE_VIDEO_SCENE_AUDIO_READY, data);
      }
      break;
    case 'courseVideoRenderReady':
      if (courseId) {
        state.io.to(`course:${courseId}`).emit(SOCKET_EVENTS.COURSE_VIDEO_RENDER_READY, data);
      }
      break;
    case 'courseVideoUpdated':
      if (courseId) {
        state.io.to(`course:${courseId}`).emit(SOCKET_EVENTS.COURSE_VIDEO_UPDATED, data);
      }
      break;
    default:
      LoggerService.warn('Unknown event type from Redis pub/sub', { type });
  }
}

/**
 * Initialize Redis pub/sub for cross-process communication.
 * The server subscribes to events published by the worker process.
 * Must be called after connection.init().
 */
function initRedis() {
  if (state.redisSubscriber || state.redisPublisher) return;

  state.redisSubscriber = new Redis({
    host: config.redis.host,
    port: config.redis.port,
    maxRetriesPerRequest: null,
  });

  state.redisPublisher = new Redis({
    host: config.redis.host,
    port: config.redis.port,
    maxRetriesPerRequest: null,
  });

  state.redisSubscriber.subscribe(REDIS_CHANNEL, (err, count) => {
    if (err) {
      LoggerService.error('Failed to subscribe to Redis channel', { error: err.message });
      return;
    }
    LoggerService.info(`Redis pub/sub subscribed to ${REDIS_CHANNEL} (${count} channels)`);
  });

  // Forward Redis messages to Socket.IO
  state.redisSubscriber.on('message', (channel, message) => {
    if (channel !== REDIS_CHANNEL) return;

    try {
      const event = JSON.parse(message);
      forwardEvent(event);
    } catch (err) {
      LoggerService.error('Failed to parse Redis pub/sub message', { error: err.message, message });
    }
  });

  LoggerService.info('Redis pub/sub initialized for cross-process events');
}

/**
 * Get or create a Redis publisher instance.
 * This is used by the worker process where io is null.
 */
function getPublisher() {
  if (state.redisPublisher) return state.redisPublisher;

  // Lazily create publisher for worker process
  try {
    state.redisPublisher = new Redis({
      host: config.redis.host,
      port: config.redis.port,
      maxRetriesPerRequest: null,
    });
  } catch (err) {
    LoggerService.error('Failed to create Redis publisher', { error: err.message });
    return null;
  }

  return state.redisPublisher;
}

/**
 * Publish an event to Redis pub/sub.
 * Used by the worker process to communicate with the server process.
 */
function publish(jobId, type, data) {
  const publisher = getPublisher();
  if (!publisher) return;

  const message = JSON.stringify({ type, jobId, data });
  publisher.publish(REDIS_CHANNEL, message).catch((err) => {
    LoggerService.error('Failed to publish Redis pub/sub message', { error: err.message });
  });
}

/**
 * Publish an event to Redis pub/sub for cross-process communication.
 * Used by the worker process to communicate with the server process.
 */
function publishToCourse(courseId, event, data) {
  const publisher = getPublisher();
  if (!publisher) return;

  const message = JSON.stringify({ type: event, courseId, data });
  publisher.publish(REDIS_CHANNEL, message).catch((err) => {
    LoggerService.error('Failed to publish Redis pub/sub message for course', { error: err.message });
  });
}

/**
 * Recent server log entries (newest last), for hydrating the Live Logs
 * page on load before any new 'serverLog' events arrive. Backed by Redis
 * so this survives a server restart.
 */
async function getRecentLogs(limit = LOG_BUFFER_MAX) {
  if (!state.redisPublisher) return [];
  try {
    const raw = await state.redisPublisher.lrange(REDIS_LOG_BUFFER_KEY, -limit, -1);
    return raw.map((entry) => {
      try {
        return JSON.parse(entry);
      } catch {
        return null;
      }
    }).filter(Boolean);
  } catch (err) {
    LoggerService.error('Failed to read log buffer from Redis', { error: err.message });
    return [];
  }
}

/**
 * Clean up Redis connections.
 */
async function close() {
  if (state.redisSubscriber) {
    await state.redisSubscriber.unsubscribe();
    await state.redisSubscriber.quit();
    state.redisSubscriber = null;
  }
  if (state.redisPublisher) {
    await state.redisPublisher.quit();
    state.redisPublisher = null;
  }
  if (state.io) {
    state.io.close();
    state.io = null;
  }
}

module.exports = { initRedis, publish, publishToCourse, getRecentLogs, close, getPublisher };
