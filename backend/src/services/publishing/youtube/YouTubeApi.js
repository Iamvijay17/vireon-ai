const config = require('../../../config');
const { ENDPOINTS, SCOPES, REQUIRED_SCOPES } = require('./constants');
const { PublishError, fromGoogleResponse, fromNetworkError } = require('../errors');

/**
 * Thin, stateless client for the Google endpoints publishing uses. It does no
 * persistence, retrying or token caching - callers (YouTubeUploader, the OAuth
 * service) own policy; this owns the wire format and turning every failure
 * into a classified PublishError. `fetchImpl` is injectable so the whole
 * publishing stack is tested against a fake Google with no network.
 *
 * Secrets: access/refresh tokens and the upload-session URL only ever travel
 * in headers/bodies/URLs of requests made here, and are never put in errors.
 */
class YouTubeApi {
  constructor({ fetchImpl = globalThis.fetch, settings = () => config.publishing } = {}) {
    this.fetch = fetchImpl;
    this.settings = settings;
  }

  get google() {
    return this.settings().google;
  }

  get timeoutMs() {
    return this.settings().youtube.requestTimeoutMs;
  }

  isConfigured() {
    const { clientId, clientSecret, redirectUri } = this.google;
    return Boolean(clientId && clientSecret && redirectUri && this.settings().encryptionKey);
  }

  assertConfigured() {
    if (!this.isConfigured()) {
      throw new PublishError('NOT_CONFIGURED', 'Google OAuth is not configured on the server');
    }
  }

  // ── low level ────────────────────────────────────────────────────────────

  async #request(url, init = {}, { timeoutMs = this.timeoutMs } = {}) {
    try {
      return await this.fetch(url, { ...init, signal: AbortSignal.timeout(timeoutMs) });
    } catch (err) {
      throw fromNetworkError(err) || new PublishError('NETWORK', 'Could not reach Google', { cause: err });
    }
  }

  async #json(res) {
    const text = await res.text().catch(() => '');
    if (!text) return null;
    try {
      return JSON.parse(text);
    } catch {
      return null;
    }
  }

  async #jsonOrThrow(res, context) {
    const body = await this.#json(res);
    if (!res.ok) throw fromGoogleResponse(res.status, body, { context });
    return body;
  }

  // ── OAuth ────────────────────────────────────────────────────────────────

  buildAuthUrl({ state, codeChallenge }) {
    this.assertConfigured();
    const url = new URL(ENDPOINTS.authorize);
    url.search = new URLSearchParams({
      client_id: this.google.clientId,
      redirect_uri: this.google.redirectUri,
      response_type: 'code',
      scope: REQUIRED_SCOPES.join(' '),
      // offline + consent: the only way Google reliably returns a refresh token.
      access_type: 'offline',
      prompt: 'consent',
      include_granted_scopes: 'false',
      state,
      code_challenge: codeChallenge,
      code_challenge_method: 'S256',
    }).toString();
    return url.toString();
  }

  async exchangeCode({ code, codeVerifier }) {
    this.assertConfigured();
    const res = await this.#request(ENDPOINTS.token, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: this.google.clientId,
        client_secret: this.google.clientSecret,
        redirect_uri: this.google.redirectUri,
        grant_type: 'authorization_code',
        code_verifier: codeVerifier,
      }),
    });
    const body = await this.#jsonOrThrow(res, 'authorization code');
    return {
      accessToken: body.access_token,
      refreshToken: body.refresh_token || null,
      expiresInSec: Number(body.expires_in) || 3600,
      scopes: String(body.scope || '').split(/\s+/).filter(Boolean),
    };
  }

  async refreshAccessToken(refreshToken) {
    this.assertConfigured();
    const res = await this.#request(ENDPOINTS.token, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        refresh_token: refreshToken,
        client_id: this.google.clientId,
        client_secret: this.google.clientSecret,
        grant_type: 'refresh_token',
      }),
    });
    const body = await this.#jsonOrThrow(res, 'token refresh');
    return { accessToken: body.access_token, expiresInSec: Number(body.expires_in) || 3600 };
  }

  /** Best effort: a failed revoke must not block disconnecting locally. Returns whether Google confirmed it. */
  async revoke(token) {
    try {
      const res = await this.#request(ENDPOINTS.revoke, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ token }),
      });
      return res.ok;
    } catch {
      return false;
    }
  }

  // ── Channel ──────────────────────────────────────────────────────────────

  /** The channel the token publishes to - channels.list?mine=true. Null when the Google account has none. */
  async getMyChannel(accessToken) {
    const url = new URL(ENDPOINTS.channels);
    url.search = new URLSearchParams({ part: 'snippet', mine: 'true' }).toString();
    const res = await this.#request(url, { headers: { Authorization: `Bearer ${accessToken}` } });
    const body = await this.#jsonOrThrow(res, 'channel');
    const item = body?.items?.[0];
    if (!item) return null;
    return {
      id: item.id,
      title: item.snippet?.title || '',
      thumbnailUrl: item.snippet?.thumbnails?.default?.url || '',
    };
  }

  // ── Resumable upload (videos.insert) ─────────────────────────────────────

  /**
   * Step 1: open a resumable session. The metadata goes in this request; the
   * response's Location header is the session URL every later chunk targets.
   */
  async initiateUpload(accessToken, { body, size, contentType }) {
    const url = new URL(ENDPOINTS.upload);
    url.search = new URLSearchParams({ uploadType: 'resumable', part: 'snippet,status' }).toString();
    const res = await this.#request(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json; charset=UTF-8',
        'X-Upload-Content-Length': String(size),
        'X-Upload-Content-Type': contentType || 'video/mp4',
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw fromGoogleResponse(res.status, await this.#json(res), { context: 'upload' });
    const location = res.headers.get('location');
    if (!location) throw new PublishError('SERVER', 'YouTube did not return an upload session URL');
    return location;
  }

  /**
   * Step 2: send bytes [start, start + length). Returns either
   * `{ done: false, nextOffset }` (308 - keep going from nextOffset, which is
   * what YouTube actually persisted and may be less than we sent) or
   * `{ done: true, video }` (200/201 - the upload is complete and confirmed).
   */
  async uploadChunk(accessToken, sessionUrl, { chunk, start, total, contentType }) {
    const end = start + chunk.length - 1;
    const res = await this.#request(
      sessionUrl,
      {
        method: 'PUT',
        // A 308 here means "resume incomplete", not a redirect - never follow it.
        redirect: 'manual',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Length': String(chunk.length),
          'Content-Type': contentType || 'video/mp4',
          'Content-Range': `bytes ${start}-${end}/${total}`,
        },
        body: chunk,
      },
      { timeoutMs: Math.max(this.timeoutMs, 5 * 60_000) }
    );
    return this.#interpretUploadResponse(res);
  }

  /** Ask YouTube how much of the session it already has (also detects a finished upload). */
  async queryUpload(accessToken, sessionUrl, { total }) {
    const res = await this.#request(sessionUrl, {
      method: 'PUT',
      redirect: 'manual',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Length': '0', 'Content-Range': `bytes */${total}` },
    });
    return this.#interpretUploadResponse(res);
  }

  async #interpretUploadResponse(res) {
    if (res.status === 308) {
      const range = res.headers.get('range'); // "bytes=0-524287"; absent = nothing stored yet
      const match = /bytes=0-(\d+)/.exec(range || '');
      return { done: false, nextOffset: match ? Number(match[1]) + 1 : 0 };
    }
    if (res.status === 200 || res.status === 201) {
      const video = await this.#json(res);
      if (!video?.id) throw new PublishError('SERVER', 'YouTube finished the upload but returned no video id');
      return { done: true, video };
    }
    throw fromGoogleResponse(res.status, await this.#json(res), { context: 'upload-session' });
  }

  // ── Post-upload verification ─────────────────────────────────────────────

  /** videos.list for one id - what YouTube says about the video now. Null if it no longer exists. */
  async getVideoStatus(accessToken, videoId) {
    const url = new URL(ENDPOINTS.videos);
    url.search = new URLSearchParams({ part: 'status,processingDetails', id: videoId }).toString();
    const res = await this.#request(url, { headers: { Authorization: `Bearer ${accessToken}` } });
    const body = await this.#jsonOrThrow(res, 'video');
    const item = body?.items?.[0];
    if (!item) return null;
    return {
      uploadStatus: item.status?.uploadStatus || '',
      privacyStatus: item.status?.privacyStatus || '',
      failureReason: item.status?.failureReason || '',
      rejectionReason: item.status?.rejectionReason || '',
      processingStatus: item.processingDetails?.processingStatus || '',
      processingFailureReason: item.processingDetails?.processingFailureReason || '',
      publishAt: item.status?.publishAt || null,
    };
  }
}

module.exports = YouTubeApi;
module.exports.SCOPES = SCOPES;
