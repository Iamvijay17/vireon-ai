import { io } from 'socket.io-client';

const SOCKET_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';

const socket = io(SOCKET_URL, {
  autoConnect: false,
  transports: ['websocket', 'polling'],
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

export default socket;
