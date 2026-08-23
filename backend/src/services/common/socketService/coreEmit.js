const { state } = require('./state');

/**
 * Emit event to a specific job room.
 */
function emitToJob(jobId, event, data) {
  if (state.io) {
    state.io.to(`job:${jobId}`).emit(event, data);
  }
}

/**
 * Emit event globally.
 */
function emit(event, data) {
  if (state.io) {
    state.io.emit(event, data);
  }
}

/**
 * Emit event to all connected clients.
 */
function emitToAll(event, data) {
  if (state.io) {
    state.io.emit(event, data);
  }
}

/**
 * Get the Socket.IO server instance.
 */
function getIO() {
  return state.io;
}

module.exports = { emitToJob, emit, emitToAll, getIO };
