const { PublishError, fromNetworkError } = require('../publishing/errors');

/**
 * Classify a failed Meta Graph / Threads API call into a PublishError.
 *
 * Meta's error envelope is
 *   { error: { message, type, code, error_subcode, is_transient, error_user_msg, fbtrace_id } }
 * and the numeric `code` / `error_subcode` carry the meaning. The mapping below
 * follows Meta's documented error-code reference where it states one, and is
 * deliberately conservative where it does not: an unrecognised failure becomes
 * UNKNOWN (not retryable) rather than being retried forever or reported as
 * something it is not.
 *
 * Nothing from the request (tokens, URLs with signed media tokens) is ever put
 * in a message - only Meta's own public error text, trimmed.
 */

const LABEL = { facebook: 'Facebook', instagram: 'Instagram', threads: 'Threads' };

// code 190 = access token invalid; subcodes 458/459/460/463/467 are the "why" (app removed, checkpoint,
// password changed, expired, invalid) - all of them mean: the user must reconnect.
const AUTH_CODES = new Set([102, 190]);
// Permission / role problems.
const PERMISSION_CODES = new Set([10, 200, 210, 220, 230, 270, 299]);
// Throttling: app-level (4), user-level (17), page-level (32), account-level (613), business-use-case (80000-80014).
const RATE_CODES = new Set([4, 17, 32, 341, 613]);
// Policy / spam blocks.
const POLICY_CODES = new Set([368, 506]);
// Generic transient server-side failures.
const TRANSIENT_CODES = new Set([1, 2, 5]);
// Instagram "media not ready / still processing" and "download of the media URL failed" family.
const MEDIA_NOT_READY_SUBCODES = new Set([2207027]);
const MEDIA_FETCH_SUBCODES = new Set([2207003, 2207004]);
const IG_SERVER_SUBCODES = new Set([2207001, 2207032]);
const IG_ACCOUNT_SUBCODES = new Set([2207050, 2207051]);
const IG_LIMIT_SUBCODES = new Set([2207042]);

function safeMessage(text, fallback) {
  const trimmed = String(text || '').replace(/\s+/g, ' ').replace(/access_token=[^&\s]+/gi, 'access_token=[redacted]').trim();
  return (trimmed || fallback).slice(0, 300);
}

function fromMetaResponse(status, body, { platform = 'facebook', context = 'request' } = {}) {
  const err = body?.error && typeof body.error === 'object' ? body.error : {};
  const code = Number(err.code) || 0;
  const subcode = Number(err.error_subcode) || 0;
  const detail = safeMessage(err.error_user_msg || err.message, '');
  const label = LABEL[platform] || 'The platform';
  const extra = { httpStatus: status, reason: [code, subcode].filter(Boolean).join('/') || (err.type || '') };

  if (AUTH_CODES.has(code) || (status === 401 && !code)) {
    return new PublishError('AUTH_REVOKED', `${label} no longer accepts this account's saved access (expired, revoked, or the password/role changed)`, {
      ...extra,
      action: 'Reconnect the account in Promotion Studio > Accounts, then retry.',
    });
  }
  if (PERMISSION_CODES.has(code) || (status === 403 && !RATE_CODES.has(code))) {
    return new PublishError('PERMISSION_DENIED', detail || `${label} refused this request: a required permission is missing`, extra);
  }
  if (RATE_CODES.has(code) || (code >= 80000 && code <= 80014) || status === 429) {
    return new PublishError('RATE_LIMITED', `${label} is rate limiting requests for this account`, extra);
  }
  if (IG_LIMIT_SUBCODES.has(subcode)) {
    return new PublishError('PUBLISH_LIMIT_REACHED', `${label}'s 24-hour publishing limit for this account is used up`, extra);
  }
  if (IG_ACCOUNT_SUBCODES.has(subcode)) {
    return new PublishError('ACCOUNT_INELIGIBLE', detail || `${label} account is restricted from publishing`, extra);
  }
  if (POLICY_CODES.has(code)) {
    return new PublishError('CONTENT_REJECTED', detail || `${label} blocked this content`, extra);
  }
  if (MEDIA_NOT_READY_SUBCODES.has(subcode) || (code === 9007)) {
    return new PublishError('MEDIA_NOT_READY', `${label} has not finished processing the media yet`, extra);
  }
  if (MEDIA_FETCH_SUBCODES.has(subcode)) {
    return new PublishError('MEDIA_UNREACHABLE', `${label} could not download the media from the public URL`, extra);
  }
  if (IG_SERVER_SUBCODES.has(subcode) || TRANSIENT_CODES.has(code) || err.is_transient === true || status >= 500) {
    return new PublishError('SERVER', `${label} had a temporary problem (HTTP ${status})`, extra);
  }
  // 2207xxx = Instagram media/container validation family (format, ratio, duration, size...).
  if (Math.floor(subcode / 1000) === 2207 || Math.floor(subcode / 1000) === 36) {
    return new PublishError('MEDIA_INVALID', detail || `${label} rejected the media`, extra);
  }
  if (code === 100 || status === 400) {
    // 100 = invalid parameter. For publish calls that is almost always the media or the text.
    const mediaContext = ['container', 'upload', 'media'].includes(context);
    return new PublishError(mediaContext ? 'MEDIA_INVALID' : 'CONTENT_REJECTED', detail || `${label} rejected the request`, extra);
  }
  if (status === 404 || status === 410) {
    return new PublishError('SOURCE_MISSING', `${label} could not find the requested ${context}`, { ...extra, retryable: false });
  }
  return new PublishError('UNKNOWN', detail || `Unexpected response from ${label} (HTTP ${status})`, extra);
}

/** What gets persisted on SocialPost.error and returned to the UI. */
function toStoredSocialError(err) {
  const pe = err instanceof PublishError ? err : new PublishError('UNKNOWN', err?.message || 'Unknown error');
  return {
    code: pe.code,
    message: pe.message,
    action: pe.action,
    retryable: pe.retryable,
    requiresReauth: pe.requiresReauth,
    httpStatus: pe.httpStatus,
    at: new Date(),
  };
}

module.exports = { fromMetaResponse, fromNetworkError, toStoredSocialError, safeMessage };
