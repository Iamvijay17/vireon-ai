const { Server } = require('socket.io');
const config = require('../../../config');
const LoggerService = require('../LoggerService');
const { SOCKET_EVENTS } = require('../../../constants');
const VideoService = require('../../video/VideoService');
const JobEventService = require('../JobEventService');
const courseQueue = require('../../../queues/courseQueue');
const { state, ROOM_ID_PATTERN, WORKER_STATUS_POLL_MS } = require('./state');

/**
 * Replay everything that happened on a job after `sinceSeq` to one socket,
 * as the same event names the client already listens for - a replayed
 * jobProgress is indistinguishable from a live one apart from arriving
 * late, so no page needs special handling to catch up after a reconnect.
 */
async function replayJobEvents(jobId, sinceSeq, socket) {
  try {
    const events = await JobEventService.since(jobId, sinceSeq);
    for (const event of events) {
      socket.emit(event.type, { ...event.data, seq: event.seq });
    }
    if (events.length > 0) {
      LoggerService.debug(`Replayed ${events.length} event(s) for job ${jobId}`, { sinceSeq });
    }
  } catch (err) {
    LoggerService.error('Failed to replay job events', { error: err.message, jobId });
  }
}

/**
 * Send current job status to a specific socket.
 */
async function sendJobStatus(jobId, socket) {
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
 * Poll BullMQ for connected course-video workers and broadcast changes to
 * every connected client, so the frontend's running/offline indicator can
 * rely on a pushed event instead of each open tab polling the REST
 * endpoint (GET /api/course-videos/worker-status) on its own timer.
 */
async function pollWorkerStatus() {
  try {
    const workers = await courseQueue.getWorkers();
    const status = { running: workers.length > 0, count: workers.length };

    if (!state.lastWorkerStatus || status.running !== state.lastWorkerStatus.running || status.count !== state.lastWorkerStatus.count) {
      state.lastWorkerStatus = status;
      if (state.io) state.io.emit(SOCKET_EVENTS.COURSE_WORKER_STATUS, status);
    }
  } catch (err) {
    LoggerService.error('Failed to poll course worker status', { error: err.message });
  }
}

function startWorkerStatusPolling() {
  if (state.workerStatusInterval) return;
  pollWorkerStatus();
  state.workerStatusInterval = setInterval(pollWorkerStatus, WORKER_STATUS_POLL_MS);
}

/**
 * Initialize Socket.IO server and Redis subscriber.
 */
function init(httpServer) {
  state.io = new Server(httpServer, {
    cors: {
      origin: config.cors.origins,
      methods: ['GET', 'POST'],
    },
  });

  state.io.on(SOCKET_EVENTS.CONNECTION, (socket) => {
    LoggerService.info(`Socket connected: ${socket.id}`);

    // Send the last-known course-worker status immediately so the
    // client's running/offline indicator doesn't sit blank until the
    // next poll tick.
    if (state.lastWorkerStatus) {
      socket.emit(SOCKET_EVENTS.COURSE_WORKER_STATUS, state.lastWorkerStatus);
    }

    // Accepts either a bare jobId (the original signature) or
    // `{ jobId, sinceSeq }` from a client that has already seen part of
    // this job's timeline and wants the rest - see JobEventService.
    socket.on(SOCKET_EVENTS.JOIN, async (payload, callback) => {
      const jobId = typeof payload === 'string' ? payload : payload?.jobId;
      const sinceSeq = typeof payload === 'object' && payload !== null ? payload.sinceSeq : null;

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

        // Replay before the status snapshot: the snapshot reflects the job
        // as it is now, so it should be the last thing the client applies.
        if (Number.isFinite(sinceSeq) && sinceSeq >= 0) {
          await replayJobEvents(jobId, sinceSeq, socket);
        }

        // Immediately send current job status to the client
        sendJobStatus(jobId, socket);
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
      sendJobStatus(jobId, socket);
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

  startWorkerStatusPolling();

  return state.io;
}

module.exports = { init, sendJobStatus };
