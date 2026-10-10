const config = require('../../config');
const { PublishError } = require('../publishing/errors');
const { GraphHttp, withQuery, formBody } = require('./http');
const { ENDPOINTS, INSTAGRAM_SCOPES } = require('./constants');

/**
 * Thin, stateless client for the Instagram API with Instagram Login (Business Login for Instagram,
 * https://developers.facebook.com/docs/instagram-platform/instagram-api-with-instagram-login).
 *
 * It signs an Instagram professional account in directly - no Facebook Page is involved - and talks to
 * graph.instagram.com with an Instagram User access token. The publishing calls deliberately have the SAME names
 * and shapes as the Instagram methods of MetaApi, so providers/InstagramProvider works with either client
 * unchanged (SocialService / the worker pick the client from the account's `meta.login`).
 *
 * Same contract as MetaApi / ThreadsApi: no persistence or retry policy, every failure a classified PublishError,
 * `fetchImpl` injectable for tests. Instagram documents `access_token` as a request parameter, so GETs carry it in
 * the query string and POSTs in the form body; URLs are never logged or placed in errors.
 */
class InstagramLoginApi {
  constructor({ fetchImpl = globalThis.fetch, settings = () => config.social, encryptionKey = () => config.publishing.encryptionKey } = {}) {
    this.settings = settings;
    this.encryptionKey = encryptionKey;
    this.http = new GraphHttp({ fetchImpl, timeoutMs: () => this.settings().requestTimeoutMs, platform: 'instagram' });
  }

  get app() {
    return this.settings().instagram;
  }

  get graph() {
    return ENDPOINTS.instagramGraph(this.settings().meta.graphVersion);
  }

  isConfigured() {
    const { appId, appSecret, redirectUri } = this.app;
    return Boolean(appId && appSecret && redirectUri && this.encryptionKey());
  }

  assertConfigured() {
    if (!this.isConfigured()) throw new PublishError('NOT_CONFIGURED', 'Instagram login is not configured on the server', {
      action: 'Add INSTAGRAM_APP_ID, INSTAGRAM_APP_SECRET and INSTAGRAM_REDIRECT_URI (and the encryption key) to backend/.env and restart - see docs/social-promotion.md.',
    });
  }

  #get(path, token, params, context) {
    return this.http.json(withQuery(`${this.graph}/${path}`, { ...params, access_token: token }), { method: 'GET' }, { context, platform: 'instagram' });
  }

  #post(path, token, params, context) {
    return this.http.json(`${this.graph}/${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: formBody({ ...params, access_token: token }),
    }, { context, platform: 'instagram' });
  }

  // ── OAuth ────────────────────────────────────────────────────────────────

  buildAuthUrl({ state }) {
    this.assertConfigured();
    return withQuery(ENDPOINTS.instagramAuthorize, {
      client_id: this.app.appId,
      redirect_uri: this.app.redirectUri,
      scope: INSTAGRAM_SCOPES.join(','),
      response_type: 'code',
      state,
      // Instagram's own sign-in only; the point of this route is that no Facebook account is involved.
      enable_fb_login: 'false',
    });
  }

  /** Authorization code (1 hour, single use) -> short-lived (1 hour) token, the Instagram user id and granted permissions. */
  async exchangeCode(code) {
    this.assertConfigured();
    const body = await this.http.json(ENDPOINTS.instagramToken, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: formBody({ client_id: this.app.appId, client_secret: this.app.appSecret, grant_type: 'authorization_code', redirect_uri: this.app.redirectUri, code }),
    }, { context: 'authorization code', platform: 'instagram' });
    // The documented response is `{ data: [{ access_token, user_id, permissions }] }`; older responses are the bare object.
    const row = Array.isArray(body?.data) ? body.data[0] : body;
    const permissions = Array.isArray(row?.permissions) ? row.permissions : String(row?.permissions || '').split(/[,\s]+/);
    return { accessToken: row?.access_token || '', userId: String(row?.user_id || ''), permissions: permissions.filter(Boolean) };
  }

  /** Short-lived -> long-lived (60 day) token. Server-side only: it carries the app secret. */
  async extendToken(shortToken) {
    this.assertConfigured();
    const body = await this.http.json(withQuery(`${ENDPOINTS.instagramGraphRoot}/access_token`, {
      grant_type: 'ig_exchange_token', client_secret: this.app.appSecret, access_token: shortToken,
    }), { method: 'GET' }, { context: 'token exchange', platform: 'instagram' });
    return { accessToken: body.access_token, expiresInSec: Number(body.expires_in) || 60 * 24 * 3600 };
  }

  /** Long-lived token -> a fresh 60-day one. Allowed once the token is >=24h old and not yet expired. */
  async refreshToken(longToken) {
    this.assertConfigured();
    const body = await this.http.json(withQuery(`${ENDPOINTS.instagramGraphRoot}/refresh_access_token`, {
      grant_type: 'ig_refresh_token', access_token: longToken,
    }), { method: 'GET' }, { context: 'token refresh', platform: 'instagram' });
    return { accessToken: body.access_token, expiresInSec: Number(body.expires_in) || 60 * 24 * 3600 };
  }

  /**
   * The account behind the token. `user_id` is the Instagram professional account id that every publishing call
   * takes; `id` is app-scoped and is NOT it.
   */
  async getProfile(token) {
    const body = await this.#get('me', token, { fields: 'user_id,username,name,account_type,profile_picture_url' }, 'profile');
    return {
      id: String(body.user_id || body.id || ''),
      username: body.username || '',
      name: body.name || '',
      accountType: body.account_type || '',
      pictureUrl: body.profile_picture_url || '',
    };
  }

  // ── Publishing (same method names / shapes as MetaApi's Instagram section) ──

  /** A media container. Instagram Login documents no resumable upload, so media always arrives by public URL. */
  async createIgContainer(igUserId, token, { mediaType, videoUrl, imageUrl, resumable = false, caption, coverUrl, isAiGenerated }) {
    if (resumable) {
      throw new PublishError('PUBLIC_MEDIA_UNAVAILABLE', 'Instagram login posts need a public media URL; resumable upload is not available for this kind of connection');
    }
    const body = await this.#post(`${igUserId}/media`, token, {
      media_type: mediaType, // REELS | VIDEO | (omit for IMAGE)
      video_url: videoUrl,
      image_url: imageUrl,
      caption,
      cover_url: coverUrl,
      is_ai_generated: isAiGenerated ? 'true' : undefined,
    }, 'container');
    return { id: body.id, uploadUrl: '' };
  }

  async getIgContainer(containerId, token) {
    const body = await this.#get(containerId, token, { fields: 'id,status_code,status' }, 'container');
    return { statusCode: body?.status_code || '', status: body?.status || '', uploadStatus: '', bytesTransferred: 0, processingStatus: '' };
  }

  async publishIgContainer(igUserId, token, containerId) {
    const body = await this.#post(`${igUserId}/media_publish`, token, { creation_id: containerId }, 'post');
    return { id: body.id };
  }

  async getIgMedia(mediaId, token) {
    const body = await this.#get(mediaId, token, { fields: 'id,permalink,media_type,media_product_type,timestamp,caption' }, 'media');
    return { id: body.id, permalink: body.permalink || '', mediaType: body.media_type || '', productType: body.media_product_type || '', timestamp: body.timestamp || null, caption: body.caption || '' };
  }

  async listIgRecentMedia(igUserId, token, limit = 10) {
    const body = await this.#get(`${igUserId}/media`, token, { fields: 'id,permalink,timestamp,caption,media_product_type', limit }, 'media');
    return body?.data || [];
  }

  async getIgPublishingLimit(igUserId, token) {
    const body = await this.#get(`${igUserId}/content_publishing_limit`, token, { fields: 'quota_usage,config' }, 'limit');
    const row = body?.data?.[0] || {};
    return { used: Number(row.quota_usage) || 0, total: Number(row.config?.quota_total) || null };
  }

  /** One insights metric of one media: { available, value, reason }. Unsupported metrics are "unavailable", never 0. */
  async getInsightMetric(mediaId, token, metric) {
    try {
      const body = await this.#get(`${mediaId}/insights`, token, { metric }, 'insights');
      const row = body?.data?.[0];
      const raw = row?.values?.[0]?.value ?? row?.total_value?.value;
      if (raw === undefined || raw === null) return { available: false, value: null, reason: 'The platform returned no value for this metric' };
      return { available: true, value: typeof raw === 'object' ? Object.values(raw).reduce((a, v) => a + (Number(v) || 0), 0) : Number(raw) };
    } catch (err) {
      if (err instanceof PublishError && ['AUTH_REVOKED', 'RATE_LIMITED', 'NETWORK', 'SERVER'].includes(err.code)) throw err;
      return { available: false, value: null, reason: err.message || 'Not available for this post' };
    }
  }
}

module.exports = InstagramLoginApi;
