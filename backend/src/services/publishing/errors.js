/**
 * Publishing failure taxonomy.
 *
 * Every failure a publish run can hit is reduced to a PublishError carrying
 * what the retry logic and the UI need: is it worth retrying, does the account
 * need to be reconnected, should we wait for the daily quota to reset, and
 * what can the user actually DO about it. Nothing here ever includes a token,
 * a request body or an upload-session URL - messages are written by us (or are
 * Google's own public error text), not copied from request internals.
 */

const CODES = Object.freeze({
  NOT_CONFIGURED: { retryable: false, action: 'Add the Google OAuth settings to backend/.env and restart (see docs/publishing.md).' },
  AUTH_REVOKED: { retryable: false, action: 'Reconnect the YouTube account on the Accounts tab, then retry.', reauth: true },
  AUTH_EXPIRED: { retryable: true, action: '' },
  CREDENTIALS_UNREADABLE: { retryable: true, action: 'This worker cannot decrypt the saved credential. Make sure every publishing worker uses the same PUBLISHING_TOKEN_ENCRYPTION_KEY the account was connected with, or reconnect the account.' },
  QUOTA_EXCEEDED: { retryable: true, action: 'The daily YouTube quota is used up. The upload resumes automatically after it resets (midnight Pacific).', defer: true },
  UPLOAD_LIMIT_EXCEEDED: { retryable: false, action: 'This channel hit YouTube\'s upload limit. Wait (usually 24 hours) or verify the channel, then retry.' },
  RATE_LIMITED: { retryable: true, action: '' },
  NETWORK: { retryable: true, action: '' },
  SERVER: { retryable: true, action: '' },
  SESSION_EXPIRED: { retryable: true, action: '' },
  INVALID_METADATA: { retryable: false, action: 'Fix the highlighted metadata (title, description, tags, category), then retry.' },
  FORBIDDEN: { retryable: false, action: 'YouTube refused this request. Check that the channel is in good standing and the permission was granted, then reconnect.' },
  PRIVACY_RESTRICTED: { retryable: false, action: 'Your Google API project is unverified, so YouTube only allows private uploads. Pass the API audit, or choose Private.' },
  SOURCE_MISSING: { retryable: false, action: 'The rendered video file is gone from storage. Re-render the lesson, then create a new publishing draft.' },
  SOURCE_CHANGED: { retryable: false, action: 'The lesson was re-rendered after this draft was created. Create a new draft so you preview what gets published.' },
  SOURCE_TOO_LARGE: { retryable: false, action: 'The file is over the configured upload limit (YOUTUBE_MAX_UPLOAD_BYTES). Re-render at a lower quality or raise the limit.' },
  VALIDATION_FAILED: { retryable: false, action: 'Fix the problems listed in the validation report, then run it again.' },
  REMOTE_REJECTED: { retryable: false, action: 'YouTube rejected or failed to process the video. Open YouTube Studio for the reason.' },
  PROCESSING_TIMEOUT: { retryable: true, action: 'YouTube is still processing the video. Retry to keep checking - it will not be uploaded again.' },
  CANCELLED: { retryable: false, action: '' },
  UNKNOWN: { retryable: false, action: 'Check the worker logs for details, then retry.' },
});

class PublishError extends Error {
  /**
   * @param {keyof CODES} code
   * @param {string} message safe, human-readable
   * @param {object} [extra] httpStatus, reason (Google's error reason), retryAfterMs, cause
   */
  constructor(code, message, extra = {}) {
    super(message);
    this.name = 'PublishError';
    this.code = CODES[code] ? code : 'UNKNOWN';
    const def = CODES[this.code];
    this.retryable = extra.retryable ?? def.retryable;
    this.action = extra.action ?? def.action;
    this.requiresReauth = Boolean(def.reauth);
    this.defer = Boolean(def.defer);
    this.httpStatus = extra.httpStatus ?? null;
    // Status when one reaches the Express error handler (only a missing configuration does: workers handle the rest).
    this.status = this.code === 'NOT_CONFIGURED' ? 503 : 502;
    this.reason = extra.reason || '';
    this.retryAfterMs = extra.retryAfterMs ?? null;
    if (extra.cause) this.cause = extra.cause;
  }
}

const NETWORK_ERROR_CODES = new Set([
  'ECONNRESET', 'ECONNREFUSED', 'ETIMEDOUT', 'ENOTFOUND', 'EAI_AGAIN', 'EPIPE', 'ECONNABORTED',
  'UND_ERR_SOCKET', 'UND_ERR_CONNECT_TIMEOUT', 'UND_ERR_HEADERS_TIMEOUT', 'UND_ERR_BODY_TIMEOUT',
]);

/** Wrap a thrown fetch/socket/timeout failure as a retryable NETWORK error. */
function fromNetworkError(err) {
  if (err instanceof PublishError) return err;
  const code = err?.cause?.code || err?.code || '';
  const timedOut = err?.name === 'TimeoutError' || err?.name === 'AbortError';
  if (timedOut || NETWORK_ERROR_CODES.has(code) || /fetch failed|network|socket/i.test(err?.message || '')) {
    return new PublishError('NETWORK', timedOut ? 'The request to Google timed out' : 'Could not reach Google (network problem)', { cause: err });
  }
  return null;
}

/**
 * Classify a Google API failure from its HTTP status and decoded JSON body.
 * Handles both response shapes Google uses: the API envelope
 * `{ error: { code, message, errors: [{ reason }] } }` and the OAuth endpoint's
 * `{ error: 'invalid_grant', error_description }`.
 */
function fromGoogleResponse(status, body, { context = 'request' } = {}) {
  const oauthError = typeof body?.error === 'string' ? body.error : '';
  const apiError = body?.error && typeof body.error === 'object' ? body.error : null;
  const reason = oauthError || apiError?.errors?.[0]?.reason || apiError?.status || '';
  const detail = apiError?.message || body?.error_description || '';
  const extra = { httpStatus: status, reason };

  // OAuth token endpoint: the grant is gone.
  if (oauthError === 'invalid_grant' || oauthError === 'unauthorized_client' || oauthError === 'invalid_client') {
    return new PublishError('AUTH_REVOKED', 'Google no longer accepts this account\'s saved permission (it was revoked or expired)', extra);
  }
  if (status === 401) {
    return new PublishError('AUTH_EXPIRED', 'Google rejected the access token', extra);
  }

  if (status === 403 || status === 429) {
    if (['quotaExceeded', 'dailyLimitExceeded'].includes(reason)) {
      return new PublishError('QUOTA_EXCEEDED', 'The YouTube daily quota has been used up', extra);
    }
    if (['rateLimitExceeded', 'userRateLimitExceeded', 'RATE_LIMIT_EXCEEDED'].includes(reason) || status === 429) {
      return new PublishError('RATE_LIMITED', 'YouTube is rate limiting requests', extra);
    }
    if (reason === 'forbiddenPrivacySetting') {
      return new PublishError('PRIVACY_RESTRICTED', detail || 'That privacy setting is not allowed for this video', extra);
    }
    if (['insufficientPermissions', 'forbidden', 'youtubeSignupRequired', 'accessNotConfigured', 'forbiddenLicenseSetting', 'ACCESS_TOKEN_SCOPE_INSUFFICIENT'].includes(reason) || status === 403) {
      const noChannel = reason === 'youtubeSignupRequired';
      return new PublishError('FORBIDDEN', noChannel ? 'The Google account has no YouTube channel' : (detail || 'YouTube refused this request'), extra);
    }
  }

  if (status === 400) {
    if (reason === 'uploadLimitExceeded') {
      return new PublishError('UPLOAD_LIMIT_EXCEEDED', 'The channel has exceeded its YouTube upload limit', extra);
    }
    return new PublishError('INVALID_METADATA', detail ? `YouTube rejected the video details: ${detail}` : 'YouTube rejected the video details', extra);
  }

  if (status === 404 && context === 'upload-session') {
    return new PublishError('SESSION_EXPIRED', 'The upload session expired', extra);
  }
  if (status === 404 || status === 410) {
    return new PublishError('SOURCE_MISSING', `YouTube could not find the requested ${context}`, { ...extra, retryable: false });
  }

  if (status === 408 || status >= 500) {
    return new PublishError('SERVER', `YouTube had a temporary problem (HTTP ${status})`, extra);
  }
  return new PublishError('UNKNOWN', detail || `Unexpected response from Google (HTTP ${status})`, extra);
}

/** What gets persisted on PublishingJob.error and returned to the UI. */
function toStoredError(err) {
  const pe = err instanceof PublishError ? err : new PublishError('UNKNOWN', err?.message || 'Unknown error');
  return {
    code: pe.code,
    message: pe.message,
    action: pe.action,
    retryable: pe.retryable,
    httpStatus: pe.httpStatus,
    at: new Date(),
  };
}

module.exports = { PublishError, CODES, fromGoogleResponse, fromNetworkError, toStoredError };
