const { Server } = require('socket.io');
const Redis = require('ioredis');
const config = require('../../config');
const LoggerService = require('./LoggerService');
const { SOCKET_EVENTS, VIDEO_STATUS, REDIS_CHANNEL, REDIS_LOG_BUFFER_KEY } = require('../../constants');
const VideoService = require('../video/VideoService');
const courseQueue = require('../../queues/courseQueue');
const { ID_PATTERN } = require('../../utils/id');

// Matches both entity ids (utils/id.js's "prefix-XXXXXXXX" shape) and the
// legacy "job-XXXXXXXX"/standalone-job style ids already in use elsewhere,
// so join/joinCourse reject garbage room names instead of letting a socket
// join an arbitrary string-keyed room. This is NOT an ownership/authz
// check - there's no user/session concept in this single-user app, so any
// client can still join any *valid* job/course id's room. It only guards
// against malformed input.
const ROOM_ID_PATTERN = ID_PATTERN;

let io = null;
let redisSubscriber = null;
let redisPublisher = null;
let workerStatusInterval = null;

// Last broadcast worker status, so a newly-connecting socket gets the
// current state immediately instead of waiting up to WORKER_STATUS_POLL_MS
// for the next poll tick.
let lastWorkerStatus = null;
const WORKER_STATUS_POLL_MS = 5000;

// Ring buffer of recent server log entries so a client opening the Live Logs
// page gets immediate context instead of a blank screen until the next line
// is emitted. Persisted to a Redis list (REDIS_LOG_BUFFER_KEY) as 'serverLog'
// events arrive from Redis pub/sub, so history survives a server restart
// instead of resetting to empty.
const LOG_BUFFER_MAX = 300;

/**
 * Socket.IO service for real-time job progress updates.
 * Single Responsibility: WebSocket communication.
 * 
 * Architecture for real-time updates across processes:
 * - Main server process: Runs Socket.IO + subscribes to Redis pub/sub
 * - Worker process: Publishes events to Redis pub/sub
 * - Redis pub/sub bridges the two processes for real-time forwarding
 */
class SocketService {
  /**
   * Initialize Socket.IO server and Redis subscriber.
   */
  static init(httpServer) {
    io = new Server(httpServer, {
      cors: {
        origin: config.cors.origins,
        methods: ['GET', 'POST'],
      },
    });

    io.on(SOCKET_EVENTS.CONNECTION, (socket) => {
      LoggerService.info(`Socket connected: ${socket.id}`);

      // Send the last-known course-worker status immediately so the
      // client's running/offline indicator doesn't sit blank until the
      // next poll tick.
      if (lastWorkerStatus) {
        socket.emit(SOCKET_EVENTS.COURSE_WORKER_STATUS, lastWorkerStatus);
      }

      socket.on(SOCKET_EVENTS.JOIN, async (jobId, callback) => {
        try {
          if (typeof jobId !== 'string' || !ROOM_ID_PATTERN.test(jobId)) {
            throw new Error('Invalid jobId');
          }
          await socket.join(`job:${jobId}`);
          LoggerService.debug(`Socket ${socket.id} joined job:${jobId}`);
          
          // Send acknowledgment
          if (callback && typeof callback === 'function') {
            callback({ status: 'ok', jobId });
          }
          
          // Immediately send current job status to the client
          SocketService.sendJobStatus(jobId, socket);
        } catch (err) {
          LoggerService.error('Error joining room', { error: err.message, jobId });
          if (callback && typeof callback === 'function') {
            callback({ status: 'error', error: err.message });
          }
        }
      });

      // Join a course room for course video events
      socket.on('joinCourse', async (courseId, callback) => {
        try {
          if (typeof courseId !== 'string' || !ROOM_ID_PATTERN.test(courseId)) {
            throw new Error('Invalid courseId');
          }
          await socket.join(`course:${courseId}`);
          LoggerService.debug(`Socket ${socket.id} joined course:${courseId}`);
          
          if (callback && typeof callback === 'function') {
            callback({ status: 'ok', courseId });
          }
        } catch (err) {
          LoggerService.error('Error joining course room', { error: err.message, courseId });
          if (callback && typeof callback === 'function') {
            callback({ status: 'error', error: err.message });
          }
        }
      });

      socket.on('getStatus', async (jobId) => {
        SocketService.sendJobStatus(jobId, socket);
      });

      socket.on(SOCKET_EVENTS.LEAVE, (jobId) => {
        socket.leave(`job:${jobId}`);
        LoggerService.debug(`Socket ${socket.id} left job:${jobId}`);
      });

      // Leave course room
      socket.on('leaveCourse', (courseId) => {
        socket.leave(`course:${courseId}`);
        LoggerService.debug(`Socket ${socket.id} left course:${courseId}`);
      });

      socket.on(SOCKET_EVENTS.DISCONNECT, () => {
        LoggerService.info(`Socket disconnected: ${socket.id}`);
      });
    });

    LoggerService.info('Socket.IO initialized');

    SocketService._startWorkerStatusPolling();

    return io;
  }

  /**
   * Poll BullMQ for connected course-video workers and broadcast changes to
   * every connected client, so the frontend's running/offline indicator can
   * rely on a pushed event instead of each open tab polling the REST
   * endpoint (GET /api/course-videos/worker-status) on its own timer.
   */
  static async _pollWorkerStatus() {
    try {
      const workers = await courseQueue.getWorkers();
      const status = { running: workers.length > 0, count: workers.length };

      if (!lastWorkerStatus || status.running !== lastWorkerStatus.running || status.count !== lastWorkerStatus.count) {
        lastWorkerStatus = status;
        if (io) io.emit(SOCKET_EVENTS.COURSE_WORKER_STATUS, status);
      }
    } catch (err) {
      LoggerService.error('Failed to poll course worker status', { error: err.message });
    }
  }

  static _startWorkerStatusPolling() {
    if (workerStatusInterval) return;
    SocketService._pollWorkerStatus();
    workerStatusInterval = setInterval(SocketService._pollWorkerStatus, WORKER_STATUS_POLL_MS);
  }

  /**
   * Initialize Redis pub/sub for cross-process communication.
   * The server subscribes to events published by the worker process.
   * Must be called after init().
   */
  static initRedis() {
    if (redisSubscriber || redisPublisher) return;

    redisSubscriber = new Redis({
      host: config.redis.host,
      port: config.redis.port,
      maxRetriesPerRequest: null,
    });

    redisPublisher = new Redis({
      host: config.redis.host,
      port: config.redis.port,
      maxRetriesPerRequest: null,
    });

    redisSubscriber.subscribe(REDIS_CHANNEL, (err, count) => {
      if (err) {
        LoggerService.error('Failed to subscribe to Redis channel', { error: err.message });
        return;
      }
      LoggerService.info(`Redis pub/sub subscribed to ${REDIS_CHANNEL} (${count} channels)`);
    });

    // Forward Redis messages to Socket.IO
    redisSubscriber.on('message', (channel, message) => {
      if (channel !== REDIS_CHANNEL) return;

      try {
        const event = JSON.parse(message);
        SocketService._forwardEvent(event);
      } catch (err) {
        LoggerService.error('Failed to parse Redis pub/sub message', { error: err.message, message });
      }
    });

    LoggerService.info('Redis pub/sub initialized for cross-process events');
  }

  /**
   * Forward an event received from Redis pub/sub to Socket.IO clients.
   */
  static _forwardEvent(event) {
    if (!io) return;

    const { type, jobId, courseId, data } = event;

    switch (type) {
      case 'jobProgress':
        SocketService.emitToJob(jobId, SOCKET_EVENTS.JOB_PROGRESS, data);
        break;
      case 'jobCompleted':
        SocketService.emitToJob(jobId, SOCKET_EVENTS.JOB_COMPLETED, data);
        break;
      case 'jobFailed':
        SocketService.emitToJob(jobId, SOCKET_EVENTS.JOB_FAILED, data);
        break;
      case 'sceneAudioReady':
        SocketService.emitToJob(jobId, SOCKET_EVENTS.SCENE_AUDIO_READY, data);
        break;
      case 'jobCreated':
        io.emit(SOCKET_EVENTS.JOB_CREATED, data);
        break;
      case 'serverLog':
        SocketService._persistLog(data);
        io.emit(SOCKET_EVENTS.SERVER_LOG, data);
        break;
      // Course video events
      case 'courseVideoProgress':
        if (courseId) {
          io.to(`course:${courseId}`).emit(SOCKET_EVENTS.COURSE_VIDEO_PROGRESS, data);
        }
        break;
      case 'courseVideoScriptReady':
        if (courseId) {
          io.to(`course:${courseId}`).emit(SOCKET_EVENTS.COURSE_VIDEO_SCRIPT_READY, data);
        }
        break;
      case 'courseVideoAudioReady':
        if (courseId) {
          io.to(`course:${courseId}`).emit(SOCKET_EVENTS.COURSE_VIDEO_AUDIO_READY, data);
        }
        break;
      case 'courseVideoSceneAudioReady':
        if (courseId) {
          io.to(`course:${courseId}`).emit(SOCKET_EVENTS.COURSE_VIDEO_SCENE_AUDIO_READY, data);
        }
        break;
      case 'courseVideoRenderReady':
        if (courseId) {
          io.to(`course:${courseId}`).emit(SOCKET_EVENTS.COURSE_VIDEO_RENDER_READY, data);
        }
        break;
      case 'courseVideoUpdated':
        if (courseId) {
          io.to(`course:${courseId}`).emit(SOCKET_EVENTS.COURSE_VIDEO_UPDATED, data);
        }
        break;
      default:
        LoggerService.warn('Unknown event type from Redis pub/sub', { type });
    }
  }

  /**
   * Append a server log entry to the Redis-backed ring buffer, trimmed to
   * LOG_BUFFER_MAX. Only the main server process calls this (from
   * _forwardEvent, after receiving the event over Redis pub/sub), so there's
   * a single writer and no cross-process race on the trim.
   */
  static _persistLog(data) {
    if (!redisPublisher) return;
    redisPublisher
      .multi()
      .rpush(REDIS_LOG_BUFFER_KEY, JSON.stringify(data))
      .ltrim(REDIS_LOG_BUFFER_KEY, -LOG_BUFFER_MAX, -1)
      .exec()
      .catch((err) => {
        LoggerService.error('Failed to persist log entry to Redis', { error: err.message });
      });
  }

  /**
   * Publish an event to Redis pub/sub.
   * Used by the worker process to communicate with the server process.
   */
  static publish(jobId, type, data) {
    const publisher = SocketService._getPublisher();
    if (!publisher) return;

    const message = JSON.stringify({ type, jobId, data });
    publisher.publish(REDIS_CHANNEL, message).catch((err) => {
      LoggerService.error('Failed to publish Redis pub/sub message', { error: err.message });
    });
  }

  /**
   * Get or create a Redis publisher instance.
   * This is used by the worker process where io is null.
   */
  static _getPublisher() {
    if (redisPublisher) return redisPublisher;

    // Lazily create publisher for worker process
    try {
      redisPublisher = new Redis({
        host: config.redis.host,
        port: config.redis.port,
        maxRetriesPerRequest: null,
      });
    } catch (err) {
      LoggerService.error('Failed to create Redis publisher', { error: err.message });
      return null;
    }

    return redisPublisher;
  }

  /**
   * Send current job status to a specific socket.
   */
  static async sendJobStatus(jobId, socket) {
    try {
      const job = await VideoService.getById(jobId);
      if (job) {
        socket.emit('jobStatus', {
          jobId: job._id,
          status: job.status,
          progress: job.progress,
          currentStep: job.currentStep,
          currentScene: job.currentScene,
          videoUrl: job.videoUrl,
          thumbnailUrl: job.thumbnailUrl,
        });
        LoggerService.debug(`Sent job status for ${jobId}`, { status: job.status });
      }
    } catch (err) {
      LoggerService.error('Failed to send job status', { error: err.message, jobId });
    }
  }

  /**
   * Emit job created event.
   */
  static emitJobCreated(job) {
    if (io) {
      io.emit(SOCKET_EVENTS.JOB_CREATED, {
        jobId: job._id,
        status: job.status,
        progress: job.progress,
        topic: job.topic,
      });
    }
  }

  /**
   * Emit job progress update.
   * In the main process, emits via Socket.IO directly.
   * In the worker process, publishes via Redis pub/sub.
   */
  static emitJobProgress(job) {
    const data = {
      jobId: job._id,
      progress: job.progress,
      status: job.status,
      currentStep: job.currentStep,
      currentScene: job.currentScene,
    };

    if (io) {
      SocketService.emitToJob(job._id, SOCKET_EVENTS.JOB_PROGRESS, data);
    } else {
      // We're in the worker process - publish via Redis
      SocketService.publish(job._id, 'jobProgress', data);
    }
  }

  /**
   * Emit a single scene's audio-ready event, as soon as that scene finishes
   * (rather than waiting for the whole batch of scenes to complete).
   * In the main process, emits via Socket.IO directly.
   * In the worker process, publishes via Redis pub/sub.
   */
  static emitSceneAudioReady(jobId, sceneNumber, audioData) {
    const data = {
      jobId,
      sceneNumber,
      audio: {
        file: audioData.file,
        duration: audioData.duration,
      },
    };

    if (io) {
      SocketService.emitToJob(jobId, SOCKET_EVENTS.SCENE_AUDIO_READY, data);
    } else {
      SocketService.publish(jobId, 'sceneAudioReady', data);
    }
  }

  /**
   * Emit job completed event.
   */
  static emitJobCompleted(job) {
    const data = {
      jobId: job._id,
      progress: 100,
      status: job.status,
      videoUrl: job.videoUrl,
      thumbnailUrl: job.thumbnailUrl,
    };

    if (io) {
      SocketService.emitToJob(job._id, SOCKET_EVENTS.JOB_COMPLETED, data);
    } else {
      SocketService.publish(job._id, 'jobCompleted', data);
    }
  }

  /**
   * Emit job failed event.
   */
  static emitJobFailed(job, error) {
    const data = {
      jobId: job._id,
      status: job.status,
      error: error || job.error?.message,
    };

    if (io) {
      SocketService.emitToJob(job._id, SOCKET_EVENTS.JOB_FAILED, data);
    } else {
      SocketService.publish(job._id, 'jobFailed', data);
    }
  }

  /**
   * Emit event to a specific job room.
   */
  static emitToJob(jobId, event, data) {
    if (io) {
      io.to(`job:${jobId}`).emit(event, data);
    }
  }

  /**
   * Emit event globally.
   */
  static emit(event, data) {
    if (io) {
      io.emit(event, data);
    }
  }

  /**
   * Publish an event to Redis pub/sub for cross-process communication.
   * Used by the worker process to communicate with the server process.
   */
  static publishToCourse(courseId, event, data) {
    const publisher = SocketService._getPublisher();
    if (!publisher) return;

    const message = JSON.stringify({ type: event, courseId, data });
    publisher.publish(REDIS_CHANNEL, message).catch((err) => {
      LoggerService.error('Failed to publish Redis pub/sub message for course', { error: err.message });
    });
  }

  /**
   * Emit event to a specific course room.
   * In the main process, emits via Socket.IO directly.
   * In the worker process, publishes via Redis pub/sub.
   */
  static emitToCourse(courseId, event, data) {
    // Add videoId/courseId to data for forwarding
    const eventData = {
      ...data,
      courseId,
    };

    if (io) {
      io.to(`course:${courseId}`).emit(event, eventData);
    } else {
      // We're in the worker process - publish via Redis
      SocketService.publishToCourse(courseId, event, eventData);
    }
  }

  /**
   * Emit course video progress update.
   * In the main process, emits via Socket.IO directly.
   * In the worker process, publishes via Redis pub/sub.
   */
  static emitCourseVideoProgress(video, status, progress, message) {
    const data = {
      videoId: video._id,
      status,
      progress,
      currentStep: status,
      message,
    };

    if (io) {
      io.to(`course:${video.courseId.toString()}`).emit(SOCKET_EVENTS.COURSE_VIDEO_PROGRESS, data);
    } else {
      SocketService.publishToCourse(video.courseId.toString(), 'courseVideoProgress', data);
    }
  }

  /**
   * Emit course video script ready event.
   * In the main process, emits via Socket.IO directly.
   * In the worker process, publishes via Redis pub/sub.
   */
  static emitCourseVideoScriptReady(video, message) {
    const data = {
      videoId: video._id,
      status: video.status,
      script: video.script,
      message,
    };

    if (io) {
      io.to(`course:${video.courseId.toString()}`).emit(SOCKET_EVENTS.COURSE_VIDEO_SCRIPT_READY, data);
    } else {
      SocketService.publishToCourse(video.courseId.toString(), 'courseVideoScriptReady', data);
    }
  }

  /**
   * Emit course video audio ready event.
   * In the main process, emits via Socket.IO directly.
   * In the worker process, publishes via Redis pub/sub.
   */
  static emitCourseVideoAudioReady(video, message) {
    const data = {
      videoId: video._id,
      status: video.status,
      audioUrl: video.audioUrl,
      audioDuration: video.audioDuration,
      message,
    };

    if (io) {
      io.to(`course:${video.courseId.toString()}`).emit(SOCKET_EVENTS.COURSE_VIDEO_AUDIO_READY, data);
    } else {
      SocketService.publishToCourse(video.courseId.toString(), 'courseVideoAudioReady', data);
    }
  }

  /**
   * Emit a single course video scene's audio-ready event, as soon as that
   * scene finishes (rather than waiting for the whole batch to complete),
   * so the course video detail page can show each scene's player as it
   * becomes available instead of only after every scene is done.
   * In the main process, emits via Socket.IO directly.
   * In the worker process, publishes via Redis pub/sub.
   */
  static emitCourseVideoSceneAudioReady(video, sceneNumber, audioData) {
    const data = {
      videoId: video._id,
      sceneNumber,
      audio: {
        file: audioData.file,
        duration: audioData.duration,
      },
    };

    if (io) {
      io.to(`course:${video.courseId.toString()}`).emit(SOCKET_EVENTS.COURSE_VIDEO_SCENE_AUDIO_READY, data);
    } else {
      SocketService.publishToCourse(video.courseId.toString(), 'courseVideoSceneAudioReady', data);
    }
  }

  /**
   * Emit course video render ready event.
   * In the main process, emits via Socket.IO directly.
   * In the worker process, publishes via Redis pub/sub.
   */
  static emitCourseVideoRenderReady(video, message) {
    const data = {
      videoId: video._id,
      status: video.status,
      renderUrl: video.renderUrl,
      message,
    };

    if (io) {
      io.to(`course:${video.courseId.toString()}`).emit(SOCKET_EVENTS.COURSE_VIDEO_RENDER_READY, data);
    } else {
      SocketService.publishToCourse(video.courseId.toString(), 'courseVideoRenderReady', data);
    }
  }

  /**
   * Emit a generic "this video's record changed" event, used after the
   * automatic cloud upload swaps local paths for GitHub URLs so the
   * frontend knows to refetch the video (script/audioUrl/renderUrl all
   * potentially changed at once).
   * In the main process, emits via Socket.IO directly.
   * In the worker process, publishes via Redis pub/sub.
   */
  static emitCourseVideoUpdated(video, message) {
    const data = {
      videoId: video._id,
      status: video.status,
      message,
    };

    if (io) {
      io.to(`course:${video.courseId.toString()}`).emit(SOCKET_EVENTS.COURSE_VIDEO_UPDATED, data);
    } else {
      SocketService.publishToCourse(video.courseId.toString(), 'courseVideoUpdated', data);
    }
  }

  /**
   * Emit course video failed event.
   * In the main process, emits via Socket.IO directly.
   * In the worker process, publishes via Redis pub/sub.
   */
  static emitCourseVideoFailed(video, error, step) {
    const data = {
      videoId: video._id,
      status: VIDEO_STATUS.FAILED,
      error: error || video.error?.message,
      step,
    };

    if (io) {
      io.to(`course:${video.courseId.toString()}`).emit(SOCKET_EVENTS.JOB_FAILED, data);
    } else {
      SocketService.publishToCourse(video.courseId.toString(), 'jobFailed', data);
    }
  }

  /**
   * Emit event to all connected clients.
   */
  static emitToAll(event, data) {
    if (io) {
      io.emit(event, data);
    }
  }

  /**
   * Get the Socket.IO server instance.
   */
  static getIO() {
    return io;
  }

  /**
   * Recent server log entries (newest last), for hydrating the Live Logs
   * page on load before any new 'serverLog' events arrive. Backed by Redis
   * so this survives a server restart.
   */
  static async getRecentLogs(limit = LOG_BUFFER_MAX) {
    if (!redisPublisher) return [];
    try {
      const raw = await redisPublisher.lrange(REDIS_LOG_BUFFER_KEY, -limit, -1);
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
  static async close() {
    if (redisSubscriber) {
      await redisSubscriber.unsubscribe();
      await redisSubscriber.quit();
      redisSubscriber = null;
    }
    if (redisPublisher) {
      await redisPublisher.quit();
      redisPublisher = null;
    }
    if (io) {
      io.close();
      io = null;
    }
  }
}

module.exports = SocketService;