const { SOCKET_EVENTS } = require('../../../constants');
const { state } = require('./state');
const { publish } = require('./redisBridge');

/**
 * Publishing events go to every connected client rather than a per-job room:
 * the dashboard shows the whole queue at once, and this is a single-user app,
 * so there is no audience to narrow to. Payloads are already sanitised
 * summaries (see PublishingEvents.summarize) - no tokens, no session URLs.
 *
 * In the API process this emits directly; in a publishing worker (no
 * Socket.IO server) it publishes over Redis and the API process forwards it
 * (redisBridge.forwardEvent), exactly like course-video progress.
 */

function emitPublishingJobUpdated(data) {
  if (state.io) {
    state.io.emit(SOCKET_EVENTS.PUBLISHING_JOB_UPDATED, data);
  } else {
    publish(data.jobId, 'publishingJobUpdated', data);
  }
}

function emitPublishingAccountUpdated(data) {
  if (state.io) {
    state.io.emit(SOCKET_EVENTS.PUBLISHING_ACCOUNT_UPDATED, data);
  } else {
    publish(data.accountId, 'publishingAccountUpdated', data);
  }
}

module.exports = { emitPublishingJobUpdated, emitPublishingAccountUpdated };
