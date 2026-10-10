const LoggerService = require('../common/LoggerService');

/**
 * Pushes publishing state to the dashboard over Socket.IO.
 *
 * Socket.IO is only the delivery mechanism - every field here was persisted
 * on the PublishingJob first, so a client that misses an event (dropped
 * connection, tab asleep) converges on its next REST fetch. Events therefore
 * carry a small, sanitised summary, never the whole document: no encrypted
 * session URL, no lease, no dedupe key.
 *
 * SocketService is required lazily: it opens Redis connections on load, which
 * unit tests of everything upstream should not pay for.
 */

function summarize(job) {
  const j = typeof job.toJSON === 'function' ? job.toJSON() : job;
  return {
    jobId: String(j._id),
    platform: j.platform,
    courseId: j.courseId,
    courseVideoId: j.courseVideoId || null,
    accountId: j.accountId || null,
    status: j.status,
    progress: j.progress || { percent: 0 },
    attempts: j.attempts || 0,
    maxAttempts: j.maxAttempts || 0,
    nextRetryAt: j.nextRetryAt || null,
    remote: j.remote
      ? { videoId: j.remote.videoId || '', url: j.remote.url || '', studioUrl: j.remote.studioUrl || '', processingState: j.remote.processingState || '' }
      : null,
    error: j.error?.code ? { code: j.error.code, message: j.error.message, action: j.error.action, retryable: !!j.error.retryable } : null,
    updatedAt: j.updatedAt || new Date(),
  };
}

function emitJob(job) {
  try {
    require('../common/SocketService').emitPublishingJobUpdated(summarize(job));
  } catch (err) {
    // Progress display must never be able to fail a publish.
    LoggerService.warn('Could not emit publishing job update', { error: err.message });
  }
}

function emitAccount(account) {
  try {
    const a = typeof account.toJSON === 'function' ? account.toJSON() : account;
    require('../common/SocketService').emitPublishingAccountUpdated({
      accountId: String(a._id),
      status: a.status,
      statusReason: a.statusReason || '',
    });
  } catch (err) {
    LoggerService.warn('Could not emit publishing account update', { error: err.message });
  }
}

module.exports = { summarize, emitJob, emitAccount };
