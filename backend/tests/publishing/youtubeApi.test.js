const { PublishError, fromGoogleResponse, fromNetworkError } = require('../../src/services/publishing/errors');
const YouTubeApi = require('../../src/services/publishing/youtube/YouTubeApi');
const { REQUIRED_SCOPES } = require('../../src/services/publishing/youtube/constants');

const settings = () => ({
  google: { clientId: 'client-id.apps.googleusercontent.com', clientSecret: 'client-secret-value', redirectUri: 'https://app.example.com/api/publishing/oauth/google/callback' },
  encryptionKey: 'k',
  youtube: { requestTimeoutMs: 5000 },
});

const json = (status, body, headers = {}) => ({
  status, ok: status >= 200 && status < 300,
  headers: { get: (name) => headers[name.toLowerCase()] ?? null },
  text: async () => (body === undefined ? '' : JSON.stringify(body)),
});

const apiWith = (fetchImpl) => new YouTubeApi({ fetchImpl, settings });

describe('Google error classification', () => {
  const google = (status, reason, message = 'msg') => fromGoogleResponse(status, { error: { code: status, message, errors: [{ reason }] } }, { context: 'video' });

  it.each([
    [403, 'quotaExceeded', 'QUOTA_EXCEEDED', true],
    [403, 'dailyLimitExceeded', 'QUOTA_EXCEEDED', true],
    [403, 'rateLimitExceeded', 'RATE_LIMITED', true],
    [429, '', 'RATE_LIMITED', true],
    [403, 'forbidden', 'FORBIDDEN', false],
    [403, 'insufficientPermissions', 'FORBIDDEN', false],
    [403, 'forbiddenPrivacySetting', 'PRIVACY_RESTRICTED', false],
    [400, 'invalidTitle', 'INVALID_METADATA', false],
    [400, 'uploadLimitExceeded', 'UPLOAD_LIMIT_EXCEEDED', false],
    [401, '', 'AUTH_EXPIRED', true],
    [500, '', 'SERVER', true],
    [503, 'backendError', 'SERVER', true],
  ])('HTTP %s %s -> %s (retryable=%s)', (status, reason, code, retryable) => {
    const err = google(status, reason);
    expect(err).toBeInstanceOf(PublishError);
    expect(err.code).toBe(code);
    expect(err.retryable).toBe(retryable);
  });

  it('treats quota exhaustion as a deferral, not a failed attempt', () => {
    expect(google(403, 'quotaExceeded').defer).toBe(true);
  });

  it('recognises a revoked/expired grant from the OAuth endpoint', () => {
    const err = fromGoogleResponse(400, { error: 'invalid_grant', error_description: 'Token has been expired or revoked.' });
    expect(err.code).toBe('AUTH_REVOKED');
    expect(err.requiresReauth).toBe(true);
    expect(err.retryable).toBe(false);
  });

  it('maps a missing upload session to SESSION_EXPIRED but a missing video to a permanent error', () => {
    expect(fromGoogleResponse(404, null, { context: 'upload-session' }).code).toBe('SESSION_EXPIRED');
    expect(fromGoogleResponse(404, null, { context: 'video' })).toMatchObject({ code: 'SOURCE_MISSING', retryable: false });
  });

  it('classifies socket and timeout failures as retryable network errors', () => {
    const reset = Object.assign(new Error('read ECONNRESET'), { code: 'ECONNRESET' });
    const timeout = Object.assign(new Error('The operation was aborted due to timeout'), { name: 'TimeoutError' });
    expect(fromNetworkError(reset)).toMatchObject({ code: 'NETWORK', retryable: true });
    expect(fromNetworkError(timeout)).toMatchObject({ code: 'NETWORK', retryable: true });
    expect(fromNetworkError(new Error('something unrelated'))).toBeNull();
  });

  it('never puts request secrets in messages', () => {
    const err = fromGoogleResponse(400, { error: 'invalid_grant', error_description: 'x' });
    expect(JSON.stringify(err)).not.toMatch(/Bearer|client_secret|refresh_token/);
  });
});

describe('YouTubeApi', () => {
  it('builds a consent URL with state, PKCE, offline access and only the needed scopes', () => {
    const url = new URL(apiWith(jest.fn()).buildAuthUrl({ state: 'STATE123', codeChallenge: 'CHALLENGE' }));
    const q = url.searchParams;
    expect(url.origin + url.pathname).toBe('https://accounts.google.com/o/oauth2/v2/auth');
    expect(q.get('state')).toBe('STATE123');
    expect(q.get('code_challenge')).toBe('CHALLENGE');
    expect(q.get('code_challenge_method')).toBe('S256');
    expect(q.get('access_type')).toBe('offline');
    expect(q.get('prompt')).toBe('consent');
    expect(q.get('response_type')).toBe('code');
    expect(q.get('scope').split(' ').sort()).toEqual([...REQUIRED_SCOPES].sort());
    expect(q.get('redirect_uri')).toBe(settings().google.redirectUri);
    expect(url.toString()).not.toContain('client-secret-value');
  });

  it('refuses to start when not configured', () => {
    const api = new YouTubeApi({ fetchImpl: jest.fn(), settings: () => ({ ...settings(), google: { clientId: '', clientSecret: '', redirectUri: '' } }) });
    expect(api.isConfigured()).toBe(false);
    expect(() => api.buildAuthUrl({ state: 's', codeChallenge: 'c' })).toThrow(expect.objectContaining({ code: 'NOT_CONFIGURED' }));
  });

  it('exchanges a code server-side with the client secret and PKCE verifier', async () => {
    const fetchImpl = jest.fn(async () => json(200, { access_token: 'AT', refresh_token: 'RT', expires_in: 3599, scope: REQUIRED_SCOPES.join(' ') }));
    const tokens = await apiWith(fetchImpl).exchangeCode({ code: 'CODE', codeVerifier: 'VERIFIER' });
    expect(tokens).toEqual({ accessToken: 'AT', refreshToken: 'RT', expiresInSec: 3599, scopes: REQUIRED_SCOPES });
    const body = fetchImpl.mock.calls[0][1].body;
    expect(body.get('client_secret')).toBe('client-secret-value');
    expect(body.get('code_verifier')).toBe('VERIFIER');
    expect(body.get('grant_type')).toBe('authorization_code');
  });

  it('surfaces a revoked refresh token as AUTH_REVOKED', async () => {
    const api = apiWith(async () => json(400, { error: 'invalid_grant' }));
    await expect(api.refreshAccessToken('RT')).rejects.toMatchObject({ code: 'AUTH_REVOKED' });
  });

  it('turns a dropped connection into a retryable NETWORK error', async () => {
    const api = apiWith(async () => { throw Object.assign(new TypeError('fetch failed'), { cause: { code: 'ECONNRESET' } }); });
    await expect(api.getMyChannel('AT')).rejects.toMatchObject({ code: 'NETWORK', retryable: true });
  });

  it('opens a resumable session and returns its Location', async () => {
    const fetchImpl = jest.fn(async () => json(200, undefined, { location: 'https://upload.example/session/abc' }));
    const url = await apiWith(fetchImpl).initiateUpload('AT', { body: { snippet: { title: 't' } }, size: 1000, contentType: 'video/mp4' });
    expect(url).toBe('https://upload.example/session/abc');
    const [target, init] = fetchImpl.mock.calls[0];
    expect(String(target)).toContain('uploadType=resumable');
    expect(String(target)).toContain('part=snippet%2Cstatus');
    expect(init.headers['X-Upload-Content-Length']).toBe('1000');
    expect(init.headers.Authorization).toBe('Bearer AT');
  });

  it('reads the confirmed offset from a 308 Range header (and 0 when YouTube has nothing)', async () => {
    const some = apiWith(async () => json(308, undefined, { range: 'bytes=0-524287' }));
    await expect(some.uploadChunk('AT', 'https://s', { chunk: Buffer.alloc(10), start: 0, total: 100 })).resolves.toEqual({ done: false, nextOffset: 524288 });
    const none = apiWith(async () => json(308, undefined, {}));
    await expect(none.queryUpload('AT', 'https://s', { total: 100 })).resolves.toEqual({ done: false, nextOffset: 0 });
  });

  it('sends Content-Range for the chunk and never follows the 308', async () => {
    const fetchImpl = jest.fn(async () => json(308, undefined, { range: 'bytes=0-9' }));
    await apiWith(fetchImpl).uploadChunk('AT', 'https://s', { chunk: Buffer.alloc(10), start: 0, total: 25 });
    const init = fetchImpl.mock.calls[0][1];
    expect(init.headers['Content-Range']).toBe('bytes 0-9/25');
    expect(init.redirect).toBe('manual');
  });

  it('treats 200/201 with a video resource as confirmed completion', async () => {
    const api = apiWith(async () => json(200, { id: 'VID123', status: { uploadStatus: 'uploaded', privacyStatus: 'private' } }));
    await expect(api.uploadChunk('AT', 'https://s', { chunk: Buffer.alloc(1), start: 9, total: 10 })).resolves.toMatchObject({ done: true, video: { id: 'VID123' } });
  });

  it('does not accept a 200 without a video id as success', async () => {
    const api = apiWith(async () => json(200, {}));
    await expect(api.queryUpload('AT', 'https://s', { total: 10 })).rejects.toMatchObject({ code: 'SERVER' });
  });

  it('reads the post-upload status of a video', async () => {
    const api = apiWith(async () => json(200, { items: [{ status: { uploadStatus: 'processed', privacyStatus: 'private' }, processingDetails: { processingStatus: 'succeeded' } }] }));
    await expect(api.getVideoStatus('AT', 'VID')).resolves.toMatchObject({ uploadStatus: 'processed', processingStatus: 'succeeded' });
    const empty = apiWith(async () => json(200, { items: [] }));
    await expect(empty.getVideoStatus('AT', 'VID')).resolves.toBeNull();
  });

  it('revoke never throws - disconnecting must work even when Google is unreachable', async () => {
    const api = apiWith(async () => { throw new Error('offline'); });
    await expect(api.revoke('RT')).resolves.toBe(false);
  });
});
