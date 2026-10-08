const { Server } = require('socket.io');
const config = require('../../../config');
const LoggerService = require('../LoggerService');
const { SOCKET_EVENTS } = require('../../../constants');
const VideoService = require('../../video/VideoService');
const JobEventService = require('../JobEventService');
const courseQueue = require('../../../queues/courseQueue');
const { computeBackoffMs } = require('../../../utils/backoff');
const { NotFoundError } = require('../../../utils/errors');
const { state, ROOM_ID_PATTERN, WORKER_STATUS_POLL_MS } = require('./state');

// ─── Connection lifecycle tracking ─────────────────────────────────────────
// Browsers reconnect all the time (laptop sleep, a dev-server restart, Vite
// HMR, a flaky LAN) and that is normal. What is not normal is one client
// connecting over and over in a tight loop - usually a client-side lifecycle
// bug. Both used to log the same bare "Socket connected/disconnected" pair,
// which made the second kind invisible among the first.
//
// Clients send a stable `auth.clientId` (see frontend services/socket.js), so
// a returning client can be told apart from a new one and reconnects can be
// counted per client rather than per (ever-changing) socket id.
const CHURN_WINDOW_MS = 60_000;
const CHURN_THRESHOLD = 8; // connections from one client inside the window
const CHURN_WARN_INTERVAL_MS = 30_000;
const CLIENT_MEMORY_MS = 10 * 60_000;

// clientId (or address) -> { connectTimes, connections, lastDisconnectAt, lastWarnAt, lastSeenAt }
const clients = new Map();

function pruneClients(now) {
  for (const [key, entry] of clients) {
    if (entry.connections === 0 && now - entry.lastSeenAt > CLIENT_MEMORY_MS) clients.delete(key);
  }
}

/** Record a connect; returns { returning, downMs, recentConnects, churning }. */
function trackConnect(key, now) {
  pruneClients(now);
  const entry = clients.get(key) || {
    connectTimes: [], connections: 0, lastDisconnectAt: null, lastWarnAt: 0, lastSeenAt: now,
  };
  const returning = entry.lastDisconnectAt !== null;
  const downMs = returning ? now - entry.lastDisconnectAt : null;

  entry.connectTimes = entry.connectTimes.filter((t) => now - t < CHURN_WINDOW_MS);
  entry.connectTimes.push(now);
  entry.connections += 1;
  entry.lastSeenAt = now;
  clients.set(key, entry);

  const churning = entry.connectTimes.length >= CHURN_THRESHOLD && now - entry.lastWarnAt > CHURN_WARN_INTERVAL_MS;
  if (churning) entry.lastWarnAt = now;
  return { returning, downMs, recentConnects: entry.connectTimes.length, churning };
}

function trackDisconnect(key, now) {
  const entry = clients.get(key);
  if (!entry) return;
  entry.connections = Math.max(0, entry.connections - 1);
  entry.lastDisconnectAt = now;
  entry.lastSeenAt = now;
}

// Disconnect reasons that mean "the network/browser went away" or "somebody
// asked for it" - expected, INFO. Anything else is surfaced as WARN.
const EXPECTED_DISCONNECT_REASONS = new Set([
  'transport close',
  'client namespace disconnect',
  'server namespace disconnect',
  'ping timeout',
  'transport error',
  'server shutting down',
]);

// Transient Mongo hiccups while reading a snapshot are retried a couple of
// times; "this id isn't a video job" is an answer, not a failure.
const STATUS_MAX_RETRIES = 2;
const STATUS_RETRY_BASE_MS = 100;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

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
      socket.emit(event.type, {
        ...event.data,
        seq: event.seq,
        // Same identity the live emit carried (events stored before eventId
        // existed simply omit it), so the client can dedupe replay vs live.
        ...(event.eventId ? { eventId: event.eventId } : {}),
        timestamp: new Date(event.at).toISOString(),
      });
    }
    if (events.length > 0) {
      LoggerService.debug(`[Socket] replayed ${events.length} event(s)`, { jobId, sinceSeq });
    }
  } catch (err) {
    LoggerService.error('[Socket] failed to replay job events', { error: err.message, jobId, sinceSeq });
  }
}

/**
 * Send the authoritative current state of a job to one socket.
 *
 * The snapshot is built from the job store (Mongo), never from what happened
 * to be emitted: Socket.IO is only the delivery mechanism, so a client that
 * missed every packet still converges here. It carries the latest event
 * `seq` so the client can tell whether it is newer than what it already has
 * (and ignore it if not), plus a deterministic `eventId` - the same state
 * always produces the same id, so sending it twice is idempotent.
 *
 * `latestSeq` is read BEFORE the job document on purpose: any event counted
 * in `seq` was already applied to the document by the time we read it, so
 * the snapshot is never older than the seq it claims.
 *
 * Transient read failures are retried a bounded number of times. A job that
 * doesn't exist is not a failure: joins also arrive for Audio Studio
 * generation ids and for jobs deleted while a tab still has them open, so
 * that is a debug-level non-event rather than an error.
 *
 * @returns {Promise<boolean>} whether a snapshot was delivered
 */
async function sendJobStatus(jobId, socket) {
  for (let attempt = 1; attempt <= STATUS_MAX_RETRIES + 1; attempt += 1) {
    try {
      const seq = await JobEventService.latestSeq(jobId);
      const job = await VideoService.getById(jobId);
      const updatedAt = job.updatedAt ? new Date(job.updatedAt).toISOString() : null;

      socket.emit('jobStatus', {
        jobId: job._id,
        status: job.status,
        progress: job.progress,
        currentStep: job.currentStep,
        currentScene: job.currentScene,
        videoUrl: job.videoUrl,
        thumbnailUrl: job.thumbnailUrl,
        eventId: `status:${job._id}:${seq}:${updatedAt || job.status}`,
        seq,
        timestamp: new Date().toISOString(),
        updatedAt,
      });
      LoggerService.debug('[Socket] job status sent', { jobId, status: job.status, seq });
      return true;
    } catch (err) {
      if (err instanceof NotFoundError) {
        LoggerService.debug('[Socket] no job state to send (not a video job, or deleted)', { jobId });
        return false;
      }
      if (attempt <= STATUS_MAX_RETRIES) {
        LoggerService.warn(`[Socket] job status retry ${attempt}/${STATUS_MAX_RETRIES}`, { jobId, attempt, error: err.message });
        await sleep(computeBackoffMs(attempt, { base: STATUS_RETRY_BASE_MS, max: 1000 }));
        continue;
      }
      LoggerService.error(`[Socket] failed to send job status after ${attempt} attempts`, {
        jobId, retryCount: STATUS_MAX_RETRIES, error: err.message,
      });
      return false;
    }
  }
  return false;
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
    const connectedAt = Date.now();
    const auth = socket.handshake.auth;
    const clientId = typeof auth?.clientId === 'string' ? auth.clientId.slice(0, 64) : null;
    const clientKey = clientId || socket.handshake.address;
    const { returning, downMs, recentConnects, churning } = trackConnect(clientKey, connectedAt);
    const connMeta = { socketId: socket.id, clientId, transport: socket.conn?.transport?.name };

    if (returning) {
      LoggerService.info('[Socket] reconnected', { ...connMeta, downMs });
    } else {
      LoggerService.info('[Socket] connected', connMeta);
    }
    if (churning) {
      LoggerService.warn('[Socket] abnormal connection churn - one client keeps reconnecting', {
        ...connMeta, connectsInWindow: recentConnects, windowMs: CHURN_WINDOW_MS,
      });
    }

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
        LoggerService.debug('[Socket] joined job room', { socketId: socket.id, jobId, sinceSeq });

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
        LoggerService.error('[Socket] error joining room', { error: err.message, jobId });
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
        LoggerService.debug('[Socket] joined course room', { socketId: socket.id, courseId });

        if (callback && typeof callback === 'function') {
          callback({ status: 'ok', courseId });
        }
      } catch (err) {
        LoggerService.error('[Socket] error joining course room', { error: err.message, courseId });
        if (callback && typeof callback === 'function') {
          callback({ status: 'error', error: err.message });
        }
      }
    });

    socket.on('getStatus', async (jobId) => {
      if (typeof jobId !== 'string' || !ROOM_ID_PATTERN.test(jobId)) return;
      sendJobStatus(jobId, socket);
    });

    socket.on(SOCKET_EVENTS.LEAVE, (jobId) => {
      socket.leave(`job:${jobId}`);
      LoggerService.debug('[Socket] left job room', { socketId: socket.id, jobId });
    });

    // Leave course room
    socket.on('leaveCourse', (courseId) => {
      socket.leave(`course:${courseId}`);
      LoggerService.debug('[Socket] left course room', { socketId: socket.id, courseId });
    });

    socket.on(SOCKET_EVENTS.DISCONNECT, (reason) => {
      trackDisconnect(clientKey, Date.now());
      const log = EXPECTED_DISCONNECT_REASONS.has(reason) ? LoggerService.info : LoggerService.warn;
      log.call(LoggerService, '[Socket] disconnected', { ...connMeta, reason, durationMs: Date.now() - connectedAt });
    });
  });

  LoggerService.info('[Socket] Socket.IO initialized');

  startWorkerStatusPolling();

  return state.io;
}

module.exports = { init, sendJobStatus };
