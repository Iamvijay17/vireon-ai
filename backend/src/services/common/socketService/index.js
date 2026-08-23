const connection = require('./connection');
const redisBridge = require('./redisBridge');
const coreEmit = require('./coreEmit');
const jobEvents = require('./jobEvents');
const courseEvents = require('./courseEvents');

/**
 * Socket.IO service for real-time job progress updates.
 * Single Responsibility: WebSocket communication.
 *
 * Architecture for real-time updates across processes:
 * - Main server process: Runs Socket.IO + subscribes to Redis pub/sub
 * - Worker process: Publishes events to Redis pub/sub
 * - Redis pub/sub bridges the two processes for real-time forwarding
 *
 * Split across state.js (shared io/Redis handles), connection.js (socket
 * lifecycle + room join/leave), redisBridge.js (cross-process pub/sub),
 * coreEmit.js (low-level room/broadcast emit), jobEvents.js (VideoJob
 * events) and courseEvents.js (CourseVideo events) - this file composes
 * their exports into the one object every caller requires as
 * SocketService.
 */
module.exports = {
  ...connection,
  ...redisBridge,
  ...coreEmit,
  ...jobEvents,
  ...courseEvents,
};
