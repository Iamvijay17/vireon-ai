import { io } from 'socket.io-client';

// Derive the socket URL from the current browser hostname so the app works
// both locally (localhost) and when accessed from another device on the LAN
// (e.g. http://192.168.1.7:5173 → socket at http://192.168.1.7:3000).
// VITE_API_URL can still override this explicitly if needed.
const getSocketUrl = () => {
  if (import.meta.env.VITE_API_URL) return import.meta.env.VITE_API_URL;
  if (import.meta.env.PROD) return window.location.origin;
  const { hostname, protocol } = window.location;
  return `${protocol}//${hostname}:3000`;
};

const SOCKET_URL = getSocketUrl();

// A stable id for this browser tab, sent on every (re)connect. A socket's own
// id changes each time it reconnects, so without this the server can't tell
// "the same tab came back" from "a brand-new client" - and so can't tell a
// normal reconnect from one tab connecting in a loop. Per-tab (sessionStorage)
// because two tabs are two logical sessions. Not a credential.
const makeClientId = () => `c-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

const getClientId = () => {
  try {
    let id = sessionStorage.getItem('vireon.clientId');
    if (!id) {
      // randomUUID only exists in secure contexts; this app is also opened
      // over plain http on the LAN.
      id = globalThis.crypto?.randomUUID?.() ?? makeClientId();
      sessionStorage.setItem('vireon.clientId', id);
    }
    return id;
  } catch {
    return makeClientId();
  }
};

// One socket for the whole app: this module is evaluated once, every hook
// shares it, and nothing creates a socket during render.
const socket = io(SOCKET_URL, {
  autoConnect: false,
  transports: ['websocket', 'polling'],
  auth: { clientId: getClientId() },
  // Keep trying for as long as the page is open - a server restart or a
  // laptop waking up can take longer than any fixed attempt budget, and a
  // socket that gave up after 5 tries stayed dead until a manual refresh.
  // Backoff (1s doubling to 10s, with jitter) keeps that from becoming a
  // tight loop against a server that is down.
  reconnection: true,
  reconnectionAttempts: Infinity,
  reconnectionDelay: 1000,
  reconnectionDelayMax: 10000,
  randomizationFactor: 0.5,
});

// Vite re-evaluates this module on a hot update, which would otherwise leave
// the previous socket connected alongside the new one - the dev-only source
// of "two connections from one tab". Close the old one when it is replaced.
if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    socket.removeAllListeners();
    socket.io.removeAllListeners();
    socket.disconnect();
  });
}

// Connection lifecycle, dev console only. Distinguishes the normal cases
// (first connect, retry after a drop, recovered) at a glance.
if (import.meta.env.DEV) {
  const log = (message, extra = '') => console.debug(`[Socket] ${message}`, extra);
  let hasConnected = false;
  socket.on('connect', () => {
    log(hasConnected ? 'reconnected' : 'connected', `socketId=${socket.id}`);
    hasConnected = true;
  });
  socket.on('disconnect', (reason) => log('disconnected', `reason=${reason}`));
  socket.on('connect_error', (err) => console.warn('[Socket] connect_error', err.message));
  socket.io.on('reconnect_attempt', (attempt) => log('reconnecting', `attempt=${attempt}`));
}

// ─── Connection Management ─────────────────────────────────────────────────────

export const connect = () => {
  if (!socket.connected) {
    socket.connect();
  }
};

export const disconnect = () => {
  if (socket.connected) {
    socket.disconnect();
  }
};

// ─── Event Replay & De-duplication ─────────────────────────────────────────────
// Every job event the backend emits carries `seq` (its position in the job's
// stored timeline), `eventId` (unique, identical for the live and replayed
// copy of the same event) and a `timestamp`. Socket.IO is only the delivery
// mechanism; the job store is the source of truth. That has three consequences
// handled here, once, instead of in every page:
//
//  1. Catch-up: remembering the highest seq seen per job lets a re-join after a
//     dropped connection ask for exactly what was missed (joinJobRoom does it).
//  2. Duplicates: an event can legitimately arrive twice (a live packet racing
//     the replay of the same event, or the join snapshot and a getStatus
//     snapshot after a reconnect). Pages get each event once.
//  3. Staleness: a delayed packet or snapshot older than state already applied
//     must not roll the UI back.
//
// Callers don't opt in - the onJob* listeners below are filtered automatically.

const lastSeqByJob = new Map(); // replay cursor: highest seq of any event seen
const lastStateSeqByJob = new Map(); // highest seq of a state-bearing event applied
const seenEventIdsByJob = new Map(); // jobId -> Set<eventId>, bounded
const MAX_REMEMBERED_EVENT_IDS = 500;

// Events that carry the job's overall state (an older one must not overwrite
// a newer one). sceneAudioReady / speechStage describe discrete things that
// happened, so only exact-duplicate filtering applies to them.
const STATE_EVENT_NAMES = new Set(['jobCreated', 'jobProgress', 'jobCompleted', 'jobFailed', 'jobStatus']);

const JOB_EVENT_NAMES = [
  'jobCreated',
  'jobProgress',
  'jobCompleted',
  'jobFailed',
  'sceneAudioReady',
  'speechStage',
  'jobStatus',
];

// socket.io hands the same payload object to every listener of one emit, so
// the classifier (registered first, below) can mark a payload and the
// per-subscriber wrappers can see the mark.
const ignoredPayloads = new WeakSet();

export const classifyJobEvent = (name, data) => {
  if (!data || typeof data !== 'object' || !data.jobId) return;
  const jobId = String(data.jobId);
  const hasSeq = typeof data.seq === 'number';

  if (data.eventId) {
    let seen = seenEventIdsByJob.get(jobId);
    if (!seen) {
      seen = new Set();
      seenEventIdsByJob.set(jobId, seen);
    }
    if (seen.has(data.eventId)) {
      ignoredPayloads.add(data);
      return;
    }
    seen.add(data.eventId);
    if (seen.size > MAX_REMEMBERED_EVENT_IDS) seen.delete(seen.values().next().value);
  } else if (hasSeq && name !== 'jobStatus' && data.seq <= (lastSeqByJob.get(jobId) ?? 0)) {
    // Events stored before eventId existed: seq is the only identity.
    ignoredPayloads.add(data);
    return;
  }

  if (!hasSeq) return;

  if (STATE_EVENT_NAMES.has(name)) {
    if (data.seq < (lastStateSeqByJob.get(jobId) ?? 0)) {
      ignoredPayloads.add(data); // older than state already applied
      return;
    }
    lastStateSeqByJob.set(jobId, data.seq);
  }

  // A snapshot's seq says where the timeline was when it was taken, not that
  // those events were delivered here - only real events move the replay cursor.
  if (name !== 'jobStatus' && data.seq > (lastSeqByJob.get(jobId) ?? 0)) {
    lastSeqByJob.set(jobId, data.seq);
  }
};

JOB_EVENT_NAMES.forEach((name) => {
  socket.on(name, (data) => classifyJobEvent(name, data));
});

/**
 * Subscribe to a job event, skipping duplicates and stale payloads. Returns
 * the unsubscribe function, like every other on* helper here.
 */
const onJobEvent = (name, callback) => {
  const handler = (data) => {
    if (data && typeof data === 'object' && ignoredPayloads.has(data)) return;
    callback(data);
  };
  socket.on(name, handler);
  return () => socket.off(name, handler);
};

const forgetJob = (jobId) => {
  const id = String(jobId);
  lastSeqByJob.delete(id);
  lastStateSeqByJob.delete(id);
  seenEventIdsByJob.delete(id);
};

// ─── Room Management ───────────────────────────────────────────────────────────

export const joinJobRoom = (jobId) => {
  const sinceSeq = lastSeqByJob.get(String(jobId));
  // No seq yet means this client hasn't seen any of this job's events, so
  // there's nothing to catch up on - a fresh page load gets current state
  // from REST plus the jobStatus snapshot the server sends on join.
  socket.emit('join', sinceSeq == null ? jobId : { jobId, sinceSeq });
};

export const leaveJobRoom = (jobId) => {
  forgetJob(jobId);
  socket.emit('leave', jobId);
};

export const joinCourseRoom = (courseId) => {
  socket.emit('joinCourse', courseId);
};

export const leaveCourseRoom = (courseId) => {
  socket.emit('leaveCourse', courseId);
};

// ─── Event Listeners ───────────────────────────────────────────────────────────

export const onJobCreated = (callback) => onJobEvent('jobCreated', callback);

export const onJobProgress = (callback) => onJobEvent('jobProgress', callback);

export const onJobCompleted = (callback) => onJobEvent('jobCompleted', callback);

export const onJobFailed = (callback) => onJobEvent('jobFailed', callback);

export const onSceneAudioReady = (callback) => onJobEvent('sceneAudioReady', callback);

// Speech-timing stages (tts:start ... render:complete) of a job; see
// lib/speechStages.js for how they become the plain-language checklist.
export const onSpeechStage = (callback) => onJobEvent('speechStage', callback);

// ─── Audio Studio (standalone TTS) Progressive Generation ──────────────────────
// Fired as each dialogue turn / chunk finishes, ahead of the whole request
// completing (rooms are joined via the generation's own id - joinJobRoom
// works for any entity id, not just video jobs, see SocketService.emitToJob).

export const onAudioStudioTurnReady = (callback) => {
  socket.on('audioStudioTurnReady', callback);
  return () => socket.off('audioStudioTurnReady', callback);
};

export const onAudioStudioChunkReady = (callback) => {
  socket.on('audioStudioChunkReady', callback);
  return () => socket.off('audioStudioChunkReady', callback);
};

export const onAudioStudioCompleted = (callback) => {
  socket.on('audioStudioCompleted', callback);
  return () => socket.off('audioStudioCompleted', callback);
};

export const onAudioStudioFailed = (callback) => {
  socket.on('audioStudioFailed', callback);
  return () => socket.off('audioStudioFailed', callback);
};

// ─── Course Video Event Listeners ────────────────────────────────────────────────

export const onCourseVideoCreated = (callback) => {
  socket.on('courseVideoCreated', callback);
  return () => socket.off('courseVideoCreated', callback);
};

export const onCourseVideoDeleted = (callback) => {
  socket.on('courseVideoDeleted', callback);
  return () => socket.off('courseVideoDeleted', callback);
};

export const onCourseVideoUpdated = (callback) => {
  socket.on('courseVideoUpdated', callback);
  return () => socket.off('courseVideoUpdated', callback);
};

export const onCourseVideoProgress = (callback) => {
  socket.on('courseVideoProgress', callback);
  return () => socket.off('courseVideoProgress', callback);
};

export const onCourseVideoScriptReady = (callback) => {
  socket.on('courseVideoScriptReady', callback);
  return () => socket.off('courseVideoScriptReady', callback);
};

export const onCourseVideoAudioReady = (callback) => {
  socket.on('courseVideoAudioReady', callback);
  return () => socket.off('courseVideoAudioReady', callback);
};

// Fires once per scene as its audio finishes, ahead of the whole-batch
// courseVideoAudioReady event, so the detail page can show each scene's
// player as soon as it's ready instead of waiting for every scene.
export const onCourseVideoSceneAudioReady = (callback) => {
  socket.on('courseVideoSceneAudioReady', callback);
  return () => socket.off('courseVideoSceneAudioReady', callback);
};

export const onCourseVideoRenderReady = (callback) => {
  socket.on('courseVideoRenderReady', callback);
  return () => socket.off('courseVideoRenderReady', callback);
};

// Pushed whenever the backend's course-video worker connects/disconnects, so
// the frontend doesn't need to poll GET /api/course-videos/worker-status.
export const onCourseWorkerStatus = (callback) => {
  socket.on('courseWorkerStatus', callback);
  return () => socket.off('courseWorkerStatus', callback);
};

// ─── Live Server Logs ──────────────────────────────────────────────────────────

export const onServerLog = (callback) => {
  socket.on('serverLog', callback);
  return () => socket.off('serverLog', callback);
};

// ─── Connection Status Store ───────────────────────────────────────────────────
// The socket's connection state is external to React, so it is exposed as a
// snapshot + subscribe pair for useSyncExternalStore rather than mirrored
// into component state via an effect. Mirroring it meant every live page
// setState'd inside its subscribe effect, and each one re-derived the
// reconnecting-vs-disconnected distinction separately.

let connectionStatus = socket.connected ? 'connected' : 'disconnected';
const statusListeners = new Set();

const setConnectionStatus = (next) => {
  if (next === connectionStatus) return; // keep snapshots referentially stable
  connectionStatus = next;
  statusListeners.forEach((listener) => listener());
};

socket.on('connect', () => setConnectionStatus('connected'));
socket.on('disconnect', (reason) =>
  // An explicit local disconnect is terminal; anything else means socket.io
  // is still retrying, so the UI should say "reconnecting", not "offline".
  setConnectionStatus(reason === 'io client disconnect' ? 'disconnected' : 'reconnecting')
);

/** Current status: 'connected' | 'reconnecting' | 'disconnected'. */
export const getConnectionStatus = () => connectionStatus;

/** Subscribe to status changes. Returns an unsubscribe function. */
export const subscribeToConnectionStatus = (listener) => {
  statusListeners.add(listener);
  return () => statusListeners.delete(listener);
};

// ─── Connection Status ─────────────────────────────────────────────────────────

export const onConnect = (callback) => {
  socket.on('connect', callback);
  return () => socket.off('connect', callback);
};

export const onDisconnect = (callback) => {
  socket.on('disconnect', callback);
  return () => socket.off('disconnect', callback);
};

export const isConnected = () => socket.connected;

// ─── Request Current Status (for reconnection) ─────────────────────────────────

export const requestJobStatus = (jobId) => {
  socket.emit('getStatus', jobId);
};

export const onJobStatus = (callback) => onJobEvent('jobStatus', callback);

export default socket;