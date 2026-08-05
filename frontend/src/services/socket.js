import { io } from 'socket.io-client';

// Derive the socket URL from the current browser hostname so the app works
// both locally (localhost) and when accessed from another device on the LAN
// (e.g. http://192.168.1.7:5173 → socket at http://192.168.1.7:3000).
// VITE_API_URL can still override this explicitly if needed.
const getSocketUrl = () => {
  if (import.meta.env.VITE_API_URL) return import.meta.env.VITE_API_URL;
  const { hostname, protocol } = window.location;
  return `${protocol}//${hostname}:3000`;
};

const SOCKET_URL = getSocketUrl();

const socket = io(SOCKET_URL, {
  autoConnect: false,
  transports: ['websocket', 'polling'],
  reconnection: true,
  reconnectionAttempts: 5,
  reconnectionDelay: 1000,
  reconnectionDelayMax: 5000,
});

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

// ─── Room Management ───────────────────────────────────────────────────────────

export const joinJobRoom = (jobId) => {
  socket.emit('join', jobId);
};

export const leaveJobRoom = (jobId) => {
  socket.emit('leave', jobId);
};

export const joinCourseRoom = (courseId) => {
  socket.emit('joinCourse', courseId);
};

export const leaveCourseRoom = (courseId) => {
  socket.emit('leaveCourse', courseId);
};

// ─── Event Listeners ───────────────────────────────────────────────────────────

export const onJobCreated = (callback) => {
  socket.on('jobCreated', callback);
  return () => socket.off('jobCreated', callback);
};

export const onJobProgress = (callback) => {
  socket.on('jobProgress', callback);
  return () => socket.off('jobProgress', callback);
};

export const onJobCompleted = (callback) => {
  socket.on('jobCompleted', callback);
  return () => socket.off('jobCompleted', callback);
};

export const onJobFailed = (callback) => {
  socket.on('jobFailed', callback);
  return () => socket.off('jobFailed', callback);
};

export const onSceneAudioReady = (callback) => {
  socket.on('sceneAudioReady', callback);
  return () => socket.off('sceneAudioReady', callback);
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

export const onCourseVideoAvatarReady = (callback) => {
  socket.on('courseVideoAvatarReady', callback);
  return () => socket.off('courseVideoAvatarReady', callback);
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

export const onJobStatus = (callback) => {
  socket.on('jobStatus', callback);
  return () => socket.off('jobStatus', callback);
};

export default socket;