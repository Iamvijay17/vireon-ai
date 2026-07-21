import { io } from 'socket.io-client';

const SOCKET_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';

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

export const onCourseVideoRenderReady = (callback) => {
  socket.on('courseVideoRenderReady', callback);
  return () => socket.off('courseVideoRenderReady', callback);
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