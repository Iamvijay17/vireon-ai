const { Readable } = require('stream');
const config = require('../../config');
const { PublishError } = require('../publishing/errors');
const { GraphHttp, withQuery, formBody } = require('./http');
const { ENDPOINTS, META_SCOPES } = require('./constants');

/**
 * Thin, stateless client for the Meta Graph API: Facebook Login, Facebook
 * Pages and Instagram (API with Facebook Login). No persistence, retrying or
 * token caching - SocialAuthService / the providers / the worker own policy;
 * this owns the wire format and turns every failure into a classified
 * PublishError.
 *
 * Tokens travel only in the `Authorization: OAuth <token>` header (as Meta's
 * docs show) so they never appear in a URL, a log line or an error message.
 * `fetchImpl` is injectable: the entire stack is exercised in tests against a
 * fake Meta, with no network and no real account.
 */
class MetaApi {
  constructor({ fetchImpl = globalThis.fetch, settings = () => config.social, encryptionKey = () => config.publishing.encryptionKey } = {}) {
    this.settings = settings;
    this.encryptionKey = encryptionKey;
    this.http = new GraphHttp({ fetchImpl, timeoutMs: () => this.settings().requestTimeoutMs, platform: 'facebook' });
  }

  get meta() {
    return this.settings().meta;
  }

  get graph() {
    return ENDPOINTS.metaGraph(this.meta.graphVersion);
  }

  isConfigured() {
    const { appId, appSecret, redirectUri } = this.meta;
    return Boolean(appId && appSecret && redirectUri && this.encryptionKey());
  }

  assertConfigured() {
    if (!this.isConfigured()) throw new PublishError('NOT_CONFIGURED', 'Meta (Facebook / Instagram) is not configured on the server', {
      action: 'Add META_APP_ID, META_APP_SECRET and META_REDIRECT_URI (and the encryption key) to backend/.env and restart - see docs/social-promotion.md.',
    });
  }

  #auth(token) {
    return { Authorization: `OAuth ${token}` };
  }

  #get(path, token, params, context, platform) {
    return this.http.json(withQuery(`${this.graph}/${path}`, params), { method: 'GET', headers: this.#auth(token) }, { context, platform });
  }

  #post(path, token, params, context, platform) {
    return this.http.json(`${this.graph}/${path}`, {
      method: 'POST',
      headers: { ...this.#auth(token), 'Content-Type': 'application/x-www-form-urlencoded' },
      body: formBody(params),
    }, { context, platform });
  }

  // ── OAuth ────────────────────────────────────────────────────────────────

  buildAuthUrl({ state }) {
    this.assertConfigured();
    return withQuery(ENDPOINTS.metaDialog(this.meta.graphVersion), {
      client_id: this.meta.appId,
      redirect_uri: this.meta.redirectUri,
      state,
      response_type: 'code',
      scope: META_SCOPES.join(','),
      // Re-ask for permissions the user previously declined, instead of silently reusing the partial grant.
      auth_type: 'rerequest',
    });
  }

  /** Authorization code -> short-lived USER access token. */
  async exchangeCode(code) {
    this.assertConfigured();
    const body = await this.http.json(`${this.graph}/oauth/access_token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: formBody({ client_id: this.meta.appId, client_secret: this.meta.appSecret, redirect_uri: this.meta.redirectUri, code }),
    }, { context: 'authorization code' });
    return { accessToken: body.access_token, expiresInSec: Number(body.expires_in) || null };
  }

  /** Short-lived user token -> long-lived (~60 day) user token. Page tokens derived from it do not expire. */
  async extendUserToken(shortToken) {
    this.assertConfigured();
    const body = await this.http.json(`${this.graph}/oauth/access_token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: formBody({ grant_type: 'fb_exchange_token', client_id: this.meta.appId, client_secret: this.meta.appSecret, fb_exchange_token: shortToken }),
    }, { context: 'token exchange' });
    return { accessToken: body.access_token, expiresInSec: Number(body.expires_in) || null };
  }

  /** The Facebook user behind a token (their app-scoped id) - what Meta's deauthorize / data-deletion callbacks name. */
  async getMe(userToken) {
    const body = await this.#get('me', userToken, { fields: 'id,name' }, 'profile');
    return { id: String(body.id), name: body.name || '' };
  }

  /** The permissions the user actually granted (granular consent lets them untick some). */
  async getPermissions(userToken) {
    const body = await this.#get('me/permissions', userToken, {}, 'permissions');
    const granted = [];
    const declined = [];
    for (const row of body?.data || []) (row.status === 'granted' ? granted : declined).push(row.permission);
    return { granted, declined };
  }

  /**
   * Every Page the user granted, each with its own Page access token and the
   * Instagram professional account linked to it (if any).
   */
  async listPages(userToken) {
    const pages = [];
    let url = withQuery(`${this.graph}/me/accounts`, {
      fields: 'id,name,access_token,tasks,picture{url},instagram_business_account{id,username,name,profile_picture_url}',
      limit: 100,
    });
    for (let i = 0; i < 10 && url; i += 1) {
      const body = await this.http.json(url, { method: 'GET', headers: this.#auth(userToken) }, { context: 'pages' });
      for (const p of body?.data || []) {
        pages.push({
          id: p.id,
          name: p.name || '',
          accessToken: p.access_token || '',
          tasks: Array.isArray(p.tasks) ? p.tasks : [],
          pictureUrl: p.picture?.data?.url || '',
          instagram: p.instagram_business_account
            ? {
              id: p.instagram_business_account.id,
              username: p.instagram_business_account.username || '',
              name: p.instagram_business_account.name || '',
              pictureUrl: p.instagram_business_account.profile_picture_url || '',
            }
            : null,
        });
      }
      url = body?.paging?.next || '';
    }
    return pages;
  }

  /**
   * Ask Meta whether a token is still valid (debug_token). Used by "validate connection".
   * The app access token is `app_id|app_secret`, sent only as a header.
   */
  async debugToken(inputToken) {
    this.assertConfigured();
    const body = await this.http.json(withQuery(`${this.graph}/debug_token`, { input_token: inputToken }), {
      method: 'GET',
      headers: this.#auth(`${this.meta.appId}|${this.meta.appSecret}`),
    }, { context: 'token' });
    const d = body?.data || {};
    return {
      isValid: Boolean(d.is_valid),
      expiresAt: d.expires_at ? new Date(d.expires_at * 1000) : null,
      scopes: Array.isArray(d.scopes) ? d.scopes : [],
      errorMessage: d.error?.message || '',
    };
  }

  // ── Facebook Page publishing ────────────────────────────────────────────

  /** Cheap authenticated call used to prove a Page token still works. */
  getPage(pageId, token) {
    return this.#get(pageId, token, { fields: 'id,name' }, 'page', 'facebook');
  }

  async publishPageText(pageId, token, { message, link }) {
    const body = await this.#post(`${pageId}/feed`, token, { message, link }, 'post', 'facebook');
    return { id: body.id };
  }

  /** Photo from a public URL, or (when `bytes` is given) uploaded directly as multipart. */
  async publishPagePhoto(pageId, token, { caption, url, bytes, fileName = 'image.jpg', contentType = 'image/jpeg' }) {
    if (url) {
      const body = await this.#post(`${pageId}/photos`, token, { url, caption, published: true }, 'media', 'facebook');
      return { id: body.id, postId: body.post_id || '' };
    }
    const form = new FormData();
    form.append('source', new Blob([bytes], { type: contentType }), fileName);
    if (caption) form.append('caption', caption);
    form.append('published', 'true');
    const body = await this.http.json(`${this.graph}/${pageId}/photos`, { method: 'POST', headers: this.#auth(token), body: form }, { context: 'media', platform: 'facebook' });
    return { id: body.id, postId: body.post_id || '' };
  }

  /** The Page's most recent posts - used to settle "did that publish go through?" for non-idempotent posts. */
  async listPagePosts(pageId, token, limit = 10) {
    const body = await this.#get(`${pageId}/posts`, token, { fields: 'id,message,created_time,permalink_url', limit }, 'posts', 'facebook');
    return body?.data || [];
  }

  // Reels: start -> upload bytes -> finish. https://developers.facebook.com/docs/video-api/guides/reels-publishing
  async startReel(pageId, token) {
    const body = await this.#post(`${pageId}/video_reels`, token, { upload_phase: 'start' }, 'upload', 'facebook');
    return { videoId: body.video_id, uploadUrl: body.upload_url || `${ENDPOINTS.metaRupload}/video-upload/${this.meta.graphVersion}/${body.video_id}` };
  }

  /**
   * Send bytes [offset, fileSize) to a rupload endpoint (Reels / Instagram). `makeBody(offset)` returns a
   * web ReadableStream (or Buffer) of exactly the remaining bytes. Resuming is the same call with a
   * later `offset` - the one Meta reports in bytes_transferred.
   */
  async ruploadBytes(uploadUrl, token, { offset = 0, fileSize, makeBody, platform = 'facebook' }) {
    const body = makeBody(offset);
    const init = {
      method: 'POST',
      headers: {
        ...this.#auth(token),
        'Content-Type': 'application/octet-stream',
        offset: String(offset),
        file_size: String(fileSize),
        'Content-Length': String(fileSize - offset),
      },
      body,
    };
    if (body && typeof body.getReader === 'function') init.duplex = 'half';
    // Uploading a large file legitimately takes long: scale the timeout with the size (min 2 min, ~1 MB/s floor).
    const timeoutMs = Math.max(120_000, Math.ceil((fileSize - offset) / 1024 / 1024) * 1000);
    const res = await this.http.json(uploadUrl, init, { context: 'upload', platform, timeoutMs });
    if (res && res.success === false) throw new PublishError('MEDIA_INVALID', res.debug_info?.message || 'The platform rejected the upload', { retryable: res.debug_info?.retriable === true });
    return res;
  }

  /** Video upload / processing / publishing phase status (Reels and regular Page videos). */
  async getVideoStatus(videoId, token) {
    const body = await this.#get(videoId, token, { fields: 'status,permalink_url,published' }, 'video', 'facebook');
    const s = body?.status || {};
    return {
      videoStatus: s.video_status || '',
      uploading: s.uploading_phase || null,
      processing: s.processing_phase || null,
      publishing: s.publishing_phase || null,
      permalink: body?.permalink_url || '',
      published: body?.published,
    };
  }

  async finishReel(pageId, token, { videoId, description, title, scheduledAt = null }) {
    const params = {
      upload_phase: 'finish', video_id: videoId, description, title,
      video_state: scheduledAt ? 'SCHEDULED' : 'PUBLISHED',
      scheduled_publish_time: scheduledAt ? Math.floor(new Date(scheduledAt).getTime() / 1000) : undefined,
    };
    const body = await this.#post(`${pageId}/video_reels`, token, params, 'post', 'facebook');
    return { success: body?.success !== false, postId: body?.post_id || '' };
  }

  // Regular (non-Reel) Page videos: chunked upload on /{page}/videos.
  async startPageVideo(pageId, token, { fileSize }) {
    const body = await this.#post(`${pageId}/videos`, token, { upload_phase: 'start', file_size: fileSize }, 'upload', 'facebook');
    return {
      sessionId: body.upload_session_id,
      videoId: body.video_id,
      startOffset: Number(body.start_offset),
      endOffset: Number(body.end_offset),
    };
  }

  async transferPageVideoChunk(pageId, token, { sessionId, startOffset, chunk }) {
    const form = new FormData();
    form.append('upload_phase', 'transfer');
    form.append('upload_session_id', sessionId);
    form.append('start_offset', String(startOffset));
    form.append('video_file_chunk', new Blob([chunk], { type: 'application/octet-stream' }), 'chunk');
    const body = await this.http.json(`${this.graph}/${pageId}/videos`, { method: 'POST', headers: this.#auth(token), body: form }, { context: 'upload', platform: 'facebook', timeoutMs: 180_000 });
    return { startOffset: Number(body.start_offset), endOffset: Number(body.end_offset) };
  }

  async finishPageVideo(pageId, token, { sessionId, title, description }) {
    const body = await this.#post(`${pageId}/videos`, token, { upload_phase: 'finish', upload_session_id: sessionId, title, description }, 'post', 'facebook');
    return { success: body?.success !== false };
  }

  // ── Instagram (API with Facebook Login) ─────────────────────────────────

  /** A media container. Exactly one of videoUrl / imageUrl / resumable. */
  async createIgContainer(igUserId, token, { mediaType, videoUrl, imageUrl, resumable = false, caption, coverUrl, isAiGenerated }) {
    const body = await this.#post(`${igUserId}/media`, token, {
      media_type: mediaType, // REELS | VIDEO | (omit for IMAGE)
      video_url: videoUrl,
      image_url: imageUrl,
      upload_type: resumable ? 'resumable' : undefined,
      caption,
      cover_url: coverUrl,
      is_ai_generated: isAiGenerated ? 'true' : undefined,
    }, 'container', 'instagram');
    return { id: body.id, uploadUrl: body.uri || '' };
  }

  async getIgContainer(containerId, token) {
    const body = await this.#get(containerId, token, { fields: 'id,status_code,status,video_status' }, 'container', 'instagram');
    return {
      statusCode: body?.status_code || '',
      status: body?.status || '',
      uploadStatus: body?.video_status?.uploading_phase?.status || '',
      bytesTransferred: Number(body?.video_status?.uploading_phase?.bytes_transferred) || 0,
      processingStatus: body?.video_status?.processing_phase?.status || '',
    };
  }

  async publishIgContainer(igUserId, token, containerId) {
    const body = await this.#post(`${igUserId}/media_publish`, token, { creation_id: containerId }, 'post', 'instagram');
    return { id: body.id };
  }

  async getIgMedia(mediaId, token) {
    const body = await this.#get(mediaId, token, { fields: 'id,permalink,media_type,media_product_type,timestamp,caption' }, 'media', 'instagram');
    return { id: body.id, permalink: body.permalink || '', mediaType: body.media_type || '', productType: body.media_product_type || '', timestamp: body.timestamp || null, caption: body.caption || '' };
  }

  async listIgRecentMedia(igUserId, token, limit = 10) {
    const body = await this.#get(`${igUserId}/media`, token, { fields: 'id,permalink,timestamp,caption,media_product_type', limit }, 'media', 'instagram');
    return body?.data || [];
  }

  async getIgPublishingLimit(igUserId, token) {
    const body = await this.#get(`${igUserId}/content_publishing_limit`, token, { fields: 'quota_usage,config' }, 'limit', 'instagram');
    const row = body?.data?.[0] || {};
    return { used: Number(row.quota_usage) || 0, total: Number(row.config?.quota_total) || null };
  }

  // ── Insights ────────────────────────────────────────────────────────────

  /**
   * One insights metric of one object. Returns { available, value, reason }.
   * Requested ONE metric at a time on purpose: Graph fails the whole request if any single metric
   * is unsupported for that object/version, which would hide the ones that do exist. An error is
   * reported as "unavailable" with the platform's reason - never as 0.
   */
  async getInsightMetric(objectId, token, metric, { platform, params = {} } = {}) {
    try {
      const body = await this.#get(`${objectId}/insights`, token, { metric, ...params }, 'insights', platform);
      const row = body?.data?.[0];
      const raw = row?.values?.[0]?.value ?? row?.total_value?.value;
      if (raw === undefined || raw === null) return { available: false, value: null, reason: 'The platform returned no value for this metric' };
      return { available: true, value: typeof raw === 'object' ? sumValues(raw) : Number(raw) };
    } catch (err) {
      if (err instanceof PublishError && ['AUTH_REVOKED', 'RATE_LIMITED', 'NETWORK', 'SERVER'].includes(err.code)) throw err;
      return { available: false, value: null, reason: err.message || 'Not available for this post' };
    }
  }

  /** Public counters on a Page post (reactions / comments / shares) - they exist independent of insights. */
  async getPostEngagement(postId, token) {
    const body = await this.#get(postId, token, { fields: 'reactions.summary(total_count).limit(0),comments.summary(total_count).limit(0),shares' }, 'insights', 'facebook');
    return {
      reactions: body?.reactions?.summary?.total_count ?? null,
      comments: body?.comments?.summary?.total_count ?? null,
      shares: body?.shares?.count ?? 0,
    };
  }
}

function sumValues(obj) {
  return Object.values(obj).reduce((a, v) => a + (Number(v) || 0), 0);
}

/**
 * A web ReadableStream over bytes [offset, size) of a stored object, read from storage in bounded
 * ranges. Used for rupload so a multi-hundred-MB video never sits in memory at once.
 */
function storageRangeStream({ storage, bucket, key, offset = 0, size, chunkBytes, onProgress, shouldAbort }) {
  async function* chunks() {
    let pos = offset;
    while (pos < size) {
      if (shouldAbort?.()) throw new PublishError('CANCELLED', 'The job was cancelled or taken over by another worker');
      const len = Math.min(chunkBytes, size - pos);
      const buf = await storage.getObjectRange(bucket, key, pos, len);
      if (!buf.length) throw new PublishError('SOURCE_MISSING', 'The stored media ended earlier than its recorded size');
      pos += buf.length;
      onProgress?.(pos);
      yield buf;
    }
  }
  return Readable.toWeb(Readable.from(chunks()));
}

module.exports = MetaApi;
module.exports.storageRangeStream = storageRangeStream;
