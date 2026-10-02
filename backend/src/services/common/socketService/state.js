const { ID_PATTERN } = require('../../../utils/id');

// Matches both entity ids (utils/id.js's "prefix-XXXXXXXX" shape) and the
// legacy "job-XXXXXXXX"/standalone-job style ids already in use elsewhere,
// so join/joinCourse reject garbage room names instead of letting a socket
// join an arbitrary string-keyed room. This is NOT an ownership/authz
// check - there's no user/session concept in this single-user app, so any
// client can still join any *valid* job/course id's room. It only guards
// against malformed input.
const ROOM_ID_PATTERN = ID_PATTERN;

// Last broadcast worker status, so a newly-connecting socket gets the
// current state immediately instead of waiting up to WORKER_STATUS_POLL_MS
// for the next poll tick.
const WORKER_STATUS_POLL_MS = 5000;

// Ring buffer of recent server log entries so a client opening the Live Logs
// page gets immediate context instead of a blank screen until the next line
// is emitted. Persisted to a Redis list (REDIS_LOG_BUFFER_KEY) as 'serverLog'
// events arrive from Redis pub/sub, so history survives a server restart
// instead of resetting to empty.
const LOG_BUFFER_MAX = 300;

// Mutable module-singleton state, shared by reference across every
// socketService/*.js file (a bare `let io` in each file would not stay in
// sync - this object is the one shared source of truth every submodule
// reads and reassigns fields on).
const state = {
  io: null,
  redisSubscriber: null,
  redisPublisher: null,
  workerStatusInterval: null,
  lastWorkerStatus: null,
};

module.exports = { state, ROOM_ID_PATTERN, WORKER_STATUS_POLL_MS, LOG_BUFFER_MAX };
