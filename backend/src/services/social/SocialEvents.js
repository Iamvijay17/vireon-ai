const LoggerService = require('../common/LoggerService');

/**
 * Pushes social post state to the dashboard over Socket.IO. Like the publishing
 * events, Socket.IO is only the delivery mechanism - every field was persisted
 * on the SocialPost first, so a client that misses an event converges on its
 * next REST fetch. Payloads are small sanitised summaries: no lease, no
 * dedupe key, no storage location, never a token.
 */
function summarize(post) {
  const p = typeof post.toJSON === 'function' ? post.toJSON() : post;
  return {
    postId: String(p._id),
    campaignId: p.campaignId,
    platform: p.platform,
    accountId: p.accountId,
    status: p.status,
    scheduledFor: p.scheduledFor || null,
    progress: p.progress || { percent: 0 },
    attempts: p.attempts || 0,
    maxAttempts: p.maxAttempts || 0,
    nextRetryAt: p.nextRetryAt || null,
    remote: p.remote ? { postId: p.remote.postId || '', permalink: p.remote.permalink || '', state: p.remote.state || '' } : null,
    error: p.error?.code ? { code: p.error.code, message: p.error.message, action: p.error.action, retryable: !!p.error.retryable, requiresReauth: !!p.error.requiresReauth } : null,
    updatedAt: p.updatedAt || new Date(),
  };
}

function emitPost(post) {
  try {
    require('../common/SocketService').emitSocialPostUpdated(summarize(post));
  } catch (err) {
    // Progress display must never be able to fail a publish.
    LoggerService.warn('Could not emit social post update', { error: err.message });
  }
}

module.exports = { summarize, emitPost };
