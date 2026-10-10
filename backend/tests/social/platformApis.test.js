const MetaApi = require('../../src/services/social/MetaApi');
const ThreadsApi = require('../../src/services/social/ThreadsApi');
const { storageRangeStream } = MetaApi;
const { PublishError } = require('../../src/services/publishing/errors');

const settings = () => ({
  requestTimeoutMs: 5000,
  meta: { appId: 'APP', appSecret: 'SECRET-META', redirectUri: 'https://app.test/api/social/oauth/meta/callback', graphVersion: 'v25.0' },
  threads: { appId: 'TAPP', appSecret: 'SECRET-THREADS', redirectUri: 'https://app.test/api/social/oauth/threads/callback' },
});

/** A fake Meta: records requests, answers from a queue of canned responses. */
function fakeFetch(responses = []) {
  const calls = [];
  const queue = [...responses];
  const impl = jest.fn(async (url, init = {}) => {
    const call = { url: String(url), method: init.method || 'GET', headers: init.headers || {}, body: init.body, signal: init.signal, duplex: init.duplex };
    if (init.body && typeof init.body === 'object' && typeof init.body[Symbol.asyncIterator] === 'function') {
      const chunks = [];
      for await (const c of init.body) chunks.push(Buffer.from(c));
      call.bytes = Buffer.concat(chunks);
    }
    calls.push(call);
    const next = queue.shift();
    if (next instanceof Error) throw next;
    const { status = 200, json = {} } = next || {};
    return { ok: status >= 200 && status < 300, status, text: async () => JSON.stringify(json) };
  });
  impl.calls = calls;
  return impl;
}

const meta = (fetchImpl) => new MetaApi({ fetchImpl, settings, encryptionKey: () => 'key' });
const threads = (fetchImpl) => new ThreadsApi({ fetchImpl, settings, encryptionKey: () => 'key' });
const formOf = (call) => Object.fromEntries(new URLSearchParams(call.body.toString()));

describe('MetaApi', () => {
  it('reports unconfigured when anything is missing and refuses to build an auth URL', () => {
    const api = new MetaApi({ fetchImpl: fakeFetch(), settings: () => ({ ...settings(), meta: { ...settings().meta, appSecret: '' } }), encryptionKey: () => 'key' });
    expect(api.isConfigured()).toBe(false);
    expect(() => api.buildAuthUrl({ state: 's' })).toThrow(PublishError);
    expect(new MetaApi({ fetchImpl: fakeFetch(), settings, encryptionKey: () => '' }).isConfigured()).toBe(false);
  });

  it('builds the Facebook Login URL with state and scopes, and never the app secret', () => {
    const url = new URL(meta(fakeFetch()).buildAuthUrl({ state: 'STATE123' }));
    expect(url.origin + url.pathname).toBe('https://www.facebook.com/v25.0/dialog/oauth');
    expect(url.searchParams.get('client_id')).toBe('APP');
    expect(url.searchParams.get('state')).toBe('STATE123');
    expect(url.searchParams.get('redirect_uri')).toBe(settings().meta.redirectUri);
    expect(url.searchParams.get('scope')).toContain('pages_manage_posts');
    expect(url.searchParams.get('scope')).toContain('instagram_content_publish');
    expect(url.toString()).not.toContain('SECRET');
  });

  it('signs in with the Configuration ID and no scope list when a Facebook Login for Business config is set', () => {
    const api = new MetaApi({ fetchImpl: fakeFetch(), settings: () => ({ ...settings(), meta: { ...settings().meta, loginConfigId: 'CFG1' } }), encryptionKey: () => 'key' });
    const url = new URL(api.buildAuthUrl({ state: 'STATE123' }));
    expect(url.searchParams.get('config_id')).toBe('CFG1');
    expect(url.searchParams.get('override_default_response_type')).toBe('true');
    expect(url.searchParams.get('response_type')).toBe('code');
    expect(url.searchParams.get('state')).toBe('STATE123');
    expect(url.searchParams.has('scope')).toBe(false);
    expect(url.toString()).not.toContain('SECRET');
  });

  it('exchanges the code with the secret in the POST body only', async () => {
    const f = fakeFetch([{ json: { access_token: 'SHORT', expires_in: 3600 } }]);
    const out = await meta(f).exchangeCode('CODE');
    expect(out.accessToken).toBe('SHORT');
    const call = f.calls[0];
    expect(call.method).toBe('POST');
    expect(call.url).not.toContain('SECRET');
    expect(formOf(call)).toMatchObject({ client_id: 'APP', client_secret: 'SECRET-META', code: 'CODE', redirect_uri: settings().meta.redirectUri });
  });

  it('sends access tokens in the Authorization header, never in the URL', async () => {
    const f = fakeFetch([{ json: { id: '1', name: 'Page' } }, { json: {} }, { json: { id: 'POST1' } }]);
    const api = meta(f);
    await api.getPage('P1', 'PAGE-TOKEN');
    await api.getPermissions('USER-TOKEN');
    await api.publishPageText('P1', 'PAGE-TOKEN', { message: 'hi' });
    for (const c of f.calls) {
      expect(c.url).not.toContain('TOKEN');
      expect(c.headers.Authorization).toMatch(/^OAuth (PAGE|USER)-TOKEN$/);
    }
    expect(formOf(f.calls[2])).toEqual({ message: 'hi' });
  });

  it('lists every Page across paging, with its token and linked Instagram account', async () => {
    const f = fakeFetch([
      { json: { data: [{ id: 'P1', name: 'One', access_token: 'PT1', tasks: ['CREATE_CONTENT'], instagram_business_account: { id: 'IG1', username: 'one_ig' } }], paging: { next: 'https://graph.facebook.com/v25.0/me/accounts?after=x' } } },
      { json: { data: [{ id: 'P2', name: 'Two', access_token: 'PT2' }] } },
    ]);
    const pages = await meta(f).listPages('USER');
    expect(pages.map((p) => p.id)).toEqual(['P1', 'P2']);
    expect(pages[0]).toMatchObject({ accessToken: 'PT1', instagram: { id: 'IG1', username: 'one_ig' } });
    expect(pages[1].instagram).toBeNull();
  });

  it('splits granted from declined permissions', async () => {
    const f = fakeFetch([{ json: { data: [{ permission: 'pages_show_list', status: 'granted' }, { permission: 'instagram_basic', status: 'declined' }] } }]);
    expect(await meta(f).getPermissions('U')).toEqual({ granted: ['pages_show_list'], declined: ['instagram_basic'] });
  });

  it('creates Instagram containers with the right parameters (public URL vs resumable)', async () => {
    const f = fakeFetch([{ json: { id: 'C1' } }, { json: { id: 'C2', uri: 'https://rupload.facebook.com/ig-api-upload/v25.0/C2' } }, { json: { id: 'C3' } }]);
    const api = meta(f);
    await api.createIgContainer('IG1', 'T', { mediaType: 'REELS', videoUrl: 'https://pub.test/v.mp4', caption: 'cap', isAiGenerated: true });
    expect(formOf(f.calls[0])).toEqual({ media_type: 'REELS', video_url: 'https://pub.test/v.mp4', caption: 'cap', is_ai_generated: 'true' });
    const resumable = await api.createIgContainer('IG1', 'T', { mediaType: 'REELS', resumable: true, caption: 'cap' });
    expect(formOf(f.calls[1])).toMatchObject({ upload_type: 'resumable', media_type: 'REELS' });
    expect(resumable.uploadUrl).toContain('rupload.facebook.com');
    await api.createIgContainer('IG1', 'T', { imageUrl: 'https://pub.test/i.jpg' });
    expect(formOf(f.calls[2])).toEqual({ image_url: 'https://pub.test/i.jpg' });
  });

  it('reads Instagram container status and upload progress', async () => {
    const f = fakeFetch([{ json: { id: 'C', status_code: 'IN_PROGRESS', video_status: { uploading_phase: { status: 'in_progress', bytes_transferred: 50002 } } } }]);
    expect(await meta(f).getIgContainer('C', 'T')).toMatchObject({ statusCode: 'IN_PROGRESS', uploadStatus: 'in_progress', bytesTransferred: 50002 });
  });

  it('uploads bytes to rupload with offset / file_size headers, streaming the remaining range', async () => {
    const storage = { getObjectRange: jest.fn(async (_b, _k, off, len) => Buffer.alloc(len, off % 251)) };
    const f = fakeFetch([{ json: { success: true } }]);
    await meta(f).ruploadBytes('https://rupload.facebook.com/video-upload/v25.0/V1', 'TOK', {
      offset: 1000, fileSize: 5000,
      makeBody: (from) => storageRangeStream({ storage, bucket: 'b', key: 'k', offset: from, size: 5000, chunkBytes: 1500 }),
    });
    const c = f.calls[0];
    expect(c.headers).toMatchObject({ offset: '1000', file_size: '5000', 'Content-Length': '4000', Authorization: 'OAuth TOK' });
    expect(c.duplex).toBe('half');
    expect(c.bytes.length).toBe(4000);
    expect(storage.getObjectRange.mock.calls.map((x) => [x[2], x[3]])).toEqual([[1000, 1500], [2500, 1500], [4000, 1000]]);
  });

  it('stops streaming bytes when the job is cancelled mid-upload', async () => {
    const storage = { getObjectRange: jest.fn(async (_b, _k, _o, len) => Buffer.alloc(len)) };
    let calls = 0;
    const stream = storageRangeStream({ storage, bucket: 'b', key: 'k', size: 10_000, chunkBytes: 1000, shouldAbort: () => (calls += 1) > 2 });
    await expect((async () => { for await (const c of stream) void c; })()).rejects.toMatchObject({ code: 'CANCELLED' });
  });

  it('reports a rejected upload as invalid media', async () => {
    const f = fakeFetch([{ json: { success: false, debug_info: { retriable: false, type: 'ProcessingFailedError', message: 'Unsupported codec' } } }]);
    await expect(meta(f).ruploadBytes('https://rupload.facebook.com/x', 'T', { fileSize: 10, makeBody: () => Buffer.alloc(10) }))
      .rejects.toMatchObject({ code: 'MEDIA_INVALID', retryable: false });
  });

  it('turns every insights metric into available/unavailable independently, never 0', async () => {
    const f = fakeFetch([
      { json: { data: [{ name: 'views', values: [{ value: 120 }] }] } },
      { status: 400, json: { error: { code: 100, message: '(#100) metric not supported for this media' } } },
      { json: { data: [{ name: 'likes', total_value: { value: 0 } }] } },
      { json: { data: [] } },
    ]);
    const api = meta(f);
    expect(await api.getInsightMetric('M', 'T', 'views', { platform: 'instagram' })).toEqual({ available: true, value: 120 });
    const bad = await api.getInsightMetric('M', 'T', 'reach', { platform: 'instagram' });
    expect(bad.available).toBe(false);
    expect(bad.value).toBeNull();
    expect(bad.reason).toMatch(/not supported/);
    // A genuine zero stays a zero (available), distinct from unavailable.
    expect(await api.getInsightMetric('M', 'T', 'likes', { platform: 'instagram' })).toEqual({ available: true, value: 0 });
    expect((await api.getInsightMetric('M', 'T', 'saved', { platform: 'instagram' })).available).toBe(false);
  });

  it('does not hide auth and rate-limit problems behind "unavailable"', async () => {
    const f = fakeFetch([{ status: 400, json: { error: { code: 190, message: 'expired' } } }, { status: 400, json: { error: { code: 4, message: 'limit' } } }]);
    const api = meta(f);
    await expect(api.getInsightMetric('M', 'T', 'views', { platform: 'instagram' })).rejects.toMatchObject({ code: 'AUTH_REVOKED' });
    await expect(api.getInsightMetric('M', 'T', 'views', { platform: 'instagram' })).rejects.toMatchObject({ code: 'RATE_LIMITED' });
  });

  it('wraps network failures as retryable NETWORK errors that do not mention Google', async () => {
    const f = fakeFetch([Object.assign(new Error('fetch failed'), { cause: { code: 'ECONNRESET' } })]);
    const err = await meta(f).getPage('P', 'T').catch((e) => e);
    expect(err).toMatchObject({ code: 'NETWORK', retryable: true });
    expect(err.message).not.toMatch(/Google/);
  });

  it('applies a request timeout signal to every call', async () => {
    const f = fakeFetch([{ json: { id: '1' } }]);
    await meta(f).getPage('P', 'T');
    expect(f.calls[0].signal).toBeInstanceOf(AbortSignal);
  });
});

describe('ThreadsApi', () => {
  it('builds the Threads authorize URL on threads.com with the publish scopes', () => {
    const url = new URL(threads(fakeFetch()).buildAuthUrl({ state: 'S1' }));
    expect(url.origin + url.pathname).toBe('https://threads.com/oauth/authorize');
    expect(url.searchParams.get('scope')).toBe('threads_basic,threads_content_publish,threads_manage_insights');
    expect(url.searchParams.get('response_type')).toBe('code');
    expect(url.searchParams.get('state')).toBe('S1');
    expect(url.toString()).not.toContain('SECRET');
  });

  it('exchanges code -> short token -> long-lived token, keeping the secret server-side', async () => {
    const f = fakeFetch([{ json: { access_token: 'SHORT', user_id: 777 } }, { json: { access_token: 'LONG', token_type: 'bearer', expires_in: 5184000 } }]);
    const api = threads(f);
    const short = await api.exchangeCode('CODE');
    expect(short).toEqual({ accessToken: 'SHORT', userId: '777' });
    expect(f.calls[0].url).toBe('https://graph.threads.com/oauth/access_token');
    expect(formOf(f.calls[0])).toMatchObject({ grant_type: 'authorization_code', code: 'CODE', client_secret: 'SECRET-THREADS' });
    const long = await api.extendToken('SHORT');
    expect(long).toEqual({ accessToken: 'LONG', expiresInSec: 5184000 });
    const u = new URL(f.calls[1].url);
    expect(u.pathname).toBe('/access_token');
    expect(u.searchParams.get('grant_type')).toBe('th_exchange_token');
  });

  it('refreshes with th_refresh_token', async () => {
    const f = fakeFetch([{ json: { access_token: 'NEW', expires_in: 5184000 } }]);
    await threads(f).refreshToken('LONG');
    const u = new URL(f.calls[0].url);
    expect(u.pathname).toBe('/refresh_access_token');
    expect(u.searchParams.get('grant_type')).toBe('th_refresh_token');
  });

  it('creates a TEXT container with a link attachment, and media containers with public URLs', async () => {
    const f = fakeFetch([{ json: { id: 'C1' } }, { json: { id: 'C2' } }, { json: { id: 'C3' } }]);
    const api = threads(f);
    await api.createContainer('U1', 'TOK', { mediaType: 'TEXT', text: 'hello', linkAttachment: 'https://e.test' });
    expect(formOf(f.calls[0])).toMatchObject({ media_type: 'TEXT', text: 'hello', link_attachment: 'https://e.test', access_token: 'TOK' });
    await api.createContainer('U1', 'TOK', { mediaType: 'VIDEO', text: 't', videoUrl: 'https://pub.test/v.mp4', linkAttachment: 'https://ignored.test' });
    expect(formOf(f.calls[1])).toMatchObject({ media_type: 'VIDEO', video_url: 'https://pub.test/v.mp4' });
    expect(formOf(f.calls[1]).link_attachment).toBeUndefined(); // only TEXT posts may carry one
    await api.createContainer('U1', 'TOK', { mediaType: 'IMAGE', imageUrl: 'https://pub.test/i.jpg' });
    expect(formOf(f.calls[2]).image_url).toBe('https://pub.test/i.jpg');
  });

  it('publishes a container and reads container status', async () => {
    const f = fakeFetch([{ json: { id: 'M1' } }, { json: { id: 'C1', status: 'ERROR', error_message: 'bad video' } }]);
    const api = threads(f);
    expect(await api.publishContainer('U1', 'TOK', 'C1')).toEqual({ id: 'M1' });
    expect(formOf(f.calls[0])).toMatchObject({ creation_id: 'C1' });
    expect(await api.getContainer('C1', 'TOK')).toEqual({ status: 'ERROR', errorMessage: 'bad video' });
  });

  it('maps an expired token to AUTH_REVOKED and unsupported insights to unavailable', async () => {
    const f = fakeFetch([
      { status: 400, json: { error: { code: 190, message: 'Error validating access token' } } },
      { status: 400, json: { error: { code: 100, message: 'metric unsupported' } } },
      { json: { data: [{ name: 'views', values: [{ value: 9 }] }] } },
    ]);
    const api = threads(f);
    await expect(api.getProfile('T')).rejects.toMatchObject({ code: 'AUTH_REVOKED' });
    expect((await api.getInsightMetric('M', 'T', 'shares')).available).toBe(false);
    expect(await api.getInsightMetric('M', 'T', 'views')).toEqual({ available: true, value: 9 });
  });
});
