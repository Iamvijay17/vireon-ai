const { Server } = require('socket.io');
const config = require('../config');
const LoggerService = require('./LoggerService');
const { SOCKET_EVENTS } = require('../constants');

let io = null;

/**
 * Socket.IO service for real-time job progress updates.
 * Single Responsibility: WebSocket communication.
 */
class SocketService {
  /**
   * Initialize Socket.IO server.
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

      socket.on(SOCKET_EVENTS.JOIN, (jobId) => {
        socket.join(`job:${jobId}`);
        LoggerService.debug(`Socket ${socket.id} joined job:${jobId}`);
      });

      socket.on(SOCKET_EVENTS.LEAVE, (jobId) => {
        socket.leave(`job:${jobId}`);
        LoggerService.debug(`Socket ${socket.id} left job:${jobId}`);
      });

      socket.on(SOCKET_EVENTS.DISCONNECT, () => {
        LoggerService.info(`Socket disconnected: ${socket.id}`);
      });
    });

    LoggerService.info('Socket.IO initialized');
    return io;
  }

  /**
   * Emit job created event.
   */
  static emitJobCreated(job) {
    SocketService.emit(SOCKET_EVENTS.JOB_CREATED, {
      jobId: job._id,
      status: job.status,
      progress: job.progress,
      topic: job.topic,
    });
  }

  /**
   * Emit job progress update.
   */
  static emitJobProgress(job) {
    SocketService.emitToJob(job._id, SOCKET_EVENTS.JOB_PROGRESS, {
      jobId: job._id,
      progress: job.progress,
      status: job.status,
      currentStep: job.currentStep,
      currentScene: job.currentScene,
    });
  }

  /**
   * Emit job completed event.
   */
  static emitJobCompleted(job) {
    SocketService.emitToJob(job._id, SOCKET_EVENTS.JOB_COMPLETED, {
      jobId: job._id,
      progress: 100,
      status: job.status,
      videoUrl: job.videoUrl,
      thumbnailUrl: job.thumbnailUrl,
    });
  }

  /**
   * Emit job failed event.
   */
  static emitJobFailed(job, error) {
    SocketService.emitToJob(job._id, SOCKET_EVENTS.JOB_FAILED, {
      jobId: job._id,
      status: job.status,
      error: error || job.error?.message,
    });
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
   * Get the Socket.IO server instance.
   */
  static getIO() {
    return io;
  }
}

module.exports = SocketService;
