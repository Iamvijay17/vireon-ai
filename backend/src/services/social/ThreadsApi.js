const config = require('../../config');
const { PublishError } = require('../publishing/errors');
const { GraphHttp, withQuery, formBody } = require('./http');
const { ENDPOINTS, THREADS_SCOPES } = require('./constants');

/**
 * Thin, stateless client for the official Threads API
 * (https://developers.facebook.com/docs/threads). Same contract as MetaApi:
 * no persistence or retry policy, every failure a classified PublishError,
 * `fetchImpl` injectable for tests.
 *
 * Token handling: Threads documents `access_token` as a request parameter, so GETs carry it in the
 * query string and POSTs in the form body. URLs are never logged or placed in errors.
 */
class ThreadsApi {
  constructor({ fetchImpl = globalThis.fetch, settings = () => config.social, encryptionKey = () => config.publishing.encryptionKey } = {}) {
    this.settings = settings;
    this.encryptionKey = encryptionKey;
    this.http = new GraphHttp({ fetchImpl, timeoutMs: () => this.settings().requestTimeoutMs, platform: 'threads' });
  }

  get app() {
    return this.settings().threads;
  }

  isConfigured() {
    const { appId, appSecret, redirectUri } = this.app;
    return Boolean(appId && appSecret && redirectUri && this.encryptionKey());
  }

  assertConfigured() {
    if (!this.isConfigured()) throw new PublishError('NOT_CONFIGURED', 'Threads is not configured on the server', {
      action: 'Add THREADS_APP_ID, THREADS_APP_SECRET and THREADS_REDIRECT_URI (and the encryption key) to backend/.env and restart - see docs/social-promotion.md.',
    });
  }

  #get(path, token, params, context) {
    return this.http.json(withQuery(`${ENDPOINTS.threadsGraph}/${path}`, { ...params, access_token: token }), { method: 'GET' }, { context });
  }

  #post(path, token, params, context) {
    return this.http.json(`${ENDPOINTS.threadsGraph}/${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: formBody({ ...params, access_token: token }),
    }, { context });
  }

  // ── OAuth ────────────────────────────────────────────────────────────────

  buildAuthUrl({ state }) {
    this.assertConfigured();
    return withQuery(ENDPOINTS.threadsAuthorize, {
      client_id: this.app.appId,
      redirect_uri: this.app.redirectUri,
      scope: THREADS_SCOPES.join(','),
      response_type: 'code',
      state,
    });
  }

  /** Authorization code -> short-lived (1 hour) token + the Threads user id. */
  async exchangeCode(code) {
    this.assertConfigured();
    const body = await this.http.json(ENDPOINTS.threadsToken, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: formBody({ client_id: this.app.appId, client_secret: this.app.appSecret, code, grant_type: 'authorization_code', redirect_uri: this.app.redirectUri }),
    }, { context: 'authorization code' });
    return { accessToken: body.access_token, userId: String(body.user_id || '') };
  }

  /** Short-lived -> long-lived (60 day) token. Server-side only: it carries the app secret. */
  async extendToken(shortToken) {
    this.assertConfigured();
    const body = await this.http.json(withQuery(`${ENDPOINTS.threadsGraphRoot}/access_token`, {
      grant_type: 'th_exchange_token', client_secret: this.app.appSecret, access_token: shortToken,
    }), { method: 'GET' }, { context: 'token exchange' });
    return { accessToken: body.access_token, expiresInSec: Number(body.expires_in) || 60 * 24 * 3600 };
  }

  /** Long-lived token -> a fresh 60-day one. Allowed once the token is >=24h old and not yet expired. */
  async refreshToken(longToken) {
    this.assertConfigured();
    const body = await this.http.json(withQuery(`${ENDPOINTS.threadsGraphRoot}/refresh_access_token`, {
      grant_type: 'th_refresh_token', access_token: longToken,
    }), { method: 'GET' }, { context: 'token refresh' });
    return { accessToken: body.access_token, expiresInSec: Number(body.expires_in) || 60 * 24 * 3600 };
  }

  async getProfile(token) {
    const body = await this.#get('me', token, { fields: 'id,username,name,threads_profile_picture_url' }, 'profile');
    return { id: String(body.id), username: body.username || '', name: body.name || '', pictureUrl: body.threads_profile_picture_url || '' };
  }

  // ── Publishing ───────────────────────────────────────────────────────────

  /** Step 1: a media container. mediaType TEXT | IMAGE | VIDEO. Media must be on a public URL. */
  async createContainer(userId, token, { mediaType, text, imageUrl, videoUrl, linkAttachment }) {
    const body = await this.#post(`${userId}/threads`, token, {
      media_type: mediaType,
      text,
      image_url: imageUrl,
      video_url: videoUrl,
      link_attachment: mediaType === 'TEXT' ? linkAttachment : undefined,
    }, 'container');
    return { id: body.id };
  }

  async getContainer(containerId, token) {
    const body = await this.#get(containerId, token, { fields: 'id,status,error_message' }, 'container');
    return { status: body?.status || '', errorMessage: body?.error_message || '' };
  }

  /** Step 2: publish the container. The returned id is the Threads media id. */
  async publishContainer(userId, token, containerId) {
    const body = await this.#post(`${userId}/threads_publish`, token, { creation_id: containerId }, 'post');
    return { id: body.id };
  }

  async getMedia(mediaId, token) {
    const body = await this.#get(mediaId, token, { fields: 'id,permalink,media_type,timestamp,text' }, 'media');
    return { id: body.id, permalink: body.permalink || '', mediaType: body.media_type || '', timestamp: body.timestamp || null, text: body.text || '' };
  }

  async listRecentThreads(userId, token, { since = null, limit = 10 } = {}) {
    const body = await this.#get(`${userId}/threads`, token, {
      fields: 'id,permalink,timestamp,text,media_type', limit, since: since ? Math.floor(new Date(since).getTime() / 1000) : undefined,
    }, 'media');
    return body?.data || [];
  }

  async getPublishingLimit(userId, token) {
    const body = await this.#get(`${userId}/threads_publishing_limit`, token, { fields: 'quota_usage,config' }, 'limit');
    const row = body?.data?.[0] || {};
    return { used: Number(row.quota_usage) || 0, total: Number(row.config?.quota_total) || null };
  }

  // ── Insights ────────────────────────────────────────────────────────────

  /** One media metric: { available, value, reason }. Unsupported/undelivered metrics are "unavailable", never 0. */
  async getInsightMetric(mediaId, token, metric) {
    try {
      const body = await this.#get(`${mediaId}/insights`, token, { metric }, 'insights');
      const row = body?.data?.[0];
      const raw = row?.values?.[0]?.value ?? row?.total_value?.value;
      if (raw === undefined || raw === null) return { available: false, value: null, reason: 'The platform returned no value for this metric' };
      return { available: true, value: Number(raw) };
    } catch (err) {
      if (err instanceof PublishError && ['AUTH_REVOKED', 'RATE_LIMITED', 'NETWORK', 'SERVER'].includes(err.code)) throw err;
      return { available: false, value: null, reason: err.message || 'Not available for this post' };
    }
  }
}

module.exports = ThreadsApi;
