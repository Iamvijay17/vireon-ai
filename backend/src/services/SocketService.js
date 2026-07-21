const { Server } = require('socket.io');
const Redis = require('ioredis');
const config = require('../config');
const LoggerService = require('./LoggerService');
const { SOCKET_EVENTS, VIDEO_STATUS } = require('../constants');
const VideoService = require('./VideoService');

let io = null;
let redisSubscriber = null;
let redisPublisher = null;

const REDIS_CHANNEL = 'vireon:job-events';

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
        origin: config.cors.origin,
        methods: ['GET', 'POST'],
      },
    });

    io.on(SOCKET_EVENTS.CONNECTION, (socket) => {
      LoggerService.info(`Socket connected: ${socket.id}`);

      socket.on(SOCKET_EVENTS.JOIN, async (jobId, callback) => {
        try {
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
    return io;
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
      case 'courseVideoRenderReady':
        if (courseId) {
          io.to(`course:${courseId}`).emit(SOCKET_EVENTS.COURSE_VIDEO_RENDER_READY, data);
        }
        break;
      default:
        LoggerService.warn('Unknown event type from Redis pub/sub', { type });
    }
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