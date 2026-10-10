jest.mock('../../src/services/common/LoggerService', () => ({
  info: jest.fn(), warn: jest.fn(), debug: jest.fn(), error: jest.fn(), success: jest.fn(), border: jest.fn(),
}));
jest.mock('../../src/services/social/SocialEvents', () => ({ emitPost: jest.fn(), summarize: jest.fn() }));
jest.mock('../../src/services/publishing/PublishingEvents', () => ({ emitJob: jest.fn(), emitAccount: jest.fn() }));
jest.mock('../../src/models/SocialPost', () => require('../publishing/helpers/fakeMongo').makeSocialPostModel());
jest.mock('../../src/models/SocialCampaign', () => require('../publishing/helpers/fakeMongo').makeCampaignModel());
jest.mock('../../src/models/PlatformAccount', () => {
  const model = require('../publishing/helpers/fakeMongo').makeAccountModel();
  model.ACCOUNT_STATUS = { CONNECTED: 'connected', NEEDS_REAUTH: 'needs_reauth' };
  return model;
});
jest.mock('../../src/models/OAuthState', () => require('../publishing/helpers/fakeMongo').makeStateModel());

let mockRuntime;
jest.mock('../../src/services/social', () => ({ getRuntime: () => mockRuntime }));
const mockStorage = { statObject: jest.fn(), getObjectRange: jest.fn() };
jest.mock('../../src/services/storage/providers', () => ({ getStorageProvider: () => mockStorage }));

const crypto = require('crypto');
const http = require('http');
const express = require('express');
const config = require('../../src/config');
const SocialPost = require('../../src/models/SocialPost');
const SocialCampaign = require('../../src/models/SocialCampaign');
const PlatformAccount = require('../../src/models/PlatformAccount');
const OAuthState = require('../../src/models/OAuthState');
const cipher = require('../../src/services/publishing/crypto');
const SocialService = require('../../src/services/social/SocialService');
const SocialAuthService = require('../../src/services/social/SocialAuthService');
const SocialPostStore = require('../../src/services/social/SocialPostStore');
const gateway = require('../../src/services/social/mediaGateway');
const errorHandler = require('../../src/middleware/errorHandler');
const router = require('../../src/routes/social');
const { fakeMeta, fakeThreads, storageFake } = require('./helpers/platforms');

const KEY = crypto.randomBytes(32).toString('base64');
const ORIGIN = config.cors.origins[0];
const FRONTEND = config.publishing.frontendUrl;
const OBJ = { bucket: 'vireon-video', key: 'job-aaaaaaaa/final.mp4' };
const ACC = { th: 'pac-thththth', fb: 'pac-fbfbfbfb' };

let server; let base; let meta; let threads; let service; let queue; let appSecret;

const call = async (method, path, { body, raw, headers = {}, origin = ORIGIN, redirect = 'manual', form } = {}) => {
  const res = await fetch(`${base}/api/social${path}`, {
    method, redirect,
    headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(origin ? { Origin: origin } : {}), ...headers },
    body: form ? new URLSearchParams(form) : raw ?? (body ? JSON.stringify(body) : undefined),
  });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch { /* not JSON */ }
  return { status: res.status, json, text, headers: res.headers };
};

const signed = (payload, secret) => {
  const body = Buffer.from(JSON.stringify({ algorithm: 'HMAC-SHA256', ...payload })).toString('base64url');
  return `${crypto.createHmac('sha256', secret).update(body).digest('base64url')}.${body}`;
};

beforeAll(async () => {
  config.publishing.encryptionKey = KEY;
  appSecret = 'meta-app-secret';
  const app = express();
  app.use('/api/social', router.mediaRouter);
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));
  app.use('/api/social', router.webhookRouter);
  app.use('/api/social', router);
  app.use(errorHandler);
  server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});
afterAll(() => new Promise((resolve) => server.close(resolve)));

beforeEach(() => {
  SocialPost.reset(); SocialCampaign.reset(); PlatformAccount.reset(); OAuthState.reset();
  jest.clearAllMocks();
  meta = fakeMeta({
    isConfigured: () => true, assertConfigured: () => {}, buildAuthUrl: ({ state }) => `https://www.facebook.com/v25.0/dialog/oauth?state=${state}`,
    exchangeCode: async () => ({ accessToken: 'SHORT' }), extendUserToken: async () => ({ accessToken: 'LONG' }),
    getPermissions: async () => ({ granted: ['pages_show_list', 'pages_manage_posts', 'instagram_basic', 'instagram_content_publish'], declined: [] }),
    getMe: async () => ({ id: 'FBUSER1' }),
    listPages: async () => [{ id: 'P1', name: 'Page', accessToken: 'SECRET-PAGE-TOKEN', tasks: ['CREATE_CONTENT'], pictureUrl: '', instagram: { id: 'IG1', username: 'ig', name: 'IG', pictureUrl: '' } }],
  });
  threads = fakeThreads({ isConfigured: () => true, assertConfigured: () => {}, buildAuthUrl: ({ state }) => `https://threads.com/oauth/authorize?state=${state}` });
  const auth = new SocialAuthService({ meta, threads });
  queue = { add: jest.fn(async () => ({})) };
  const storage = storageFake({ [`${OBJ.bucket}/${OBJ.key}`]: { size: 5000, etag: 'etag-1' } });
  const sources = {
    resolve: async () => ({ media: { kind: 'video', ...OBJ, size: 5000, etag: 'etag-1', contentType: 'video/mp4', fileName: 'v.mp4', durationSec: 30, width: 1080, height: 1920, measured: 'record' }, thumbnail: null, title: 'T', description: 'D', excerpt: '', source: { videoJobId: 'job-aaaaaaaa', courseVideoId: null, title: 'T', description: 'D' } }),
    library: async () => ({ videos: [], lessons: [] }),
  };
  service = new SocialService({ auth, apis: { meta, threads }, queues: () => queue, storage, store: new SocialPostStore(), sources, captions: { generate: async () => ({}) },
    settings: () => ({ ...config.social, publicMediaBaseUrl: '', minScheduleLeadMs: 120_000, maxScheduleAheadDays: 180, maxAttempts: 3, dailyLimits: config.social.dailyLimits }) });
  mockRuntime = { auth, service, apis: { meta, threads }, store: new SocialPostStore() };
  PlatformAccount.seed({ _id: ACC.th, ownerId: 'local', platform: 'threads', externalId: '777', displayName: 'Me', accessTokenEnc: cipher.encrypt('SECRET-THREADS-TOKEN'), tokenExpiresAt: new Date(Date.now() + 40 * 86400_000), lastRefreshedAt: new Date() });
  config.social.meta.appSecret = appSecret;
  config.social.threads.appSecret = 'threads-app-secret';
});

describe('capabilities and account listing', () => {
  it('serves capabilities without credentials', async () => {
    const r = await call('GET', '/capabilities');
    expect(r.status).toBe(200);
    expect(r.json.platforms.threads.label).toBe('Threads');
    expect(r.json.testing.sandbox).toBe(false);
  });

  it('never exposes tokens in any account response', async () => {
    const list = await call('GET', '/accounts');
    expect(list.status).toBe(200);
    expect(list.json.accounts).toHaveLength(1);
    expect(list.text).not.toMatch(/SECRET-THREADS-TOKEN|accessTokenEnc|v1:/);
  });
});

describe('OAuth over HTTP', () => {
  it('starts a flow and returns the consent URL (and only that)', async () => {
    const r = await call('POST', '/accounts/meta/connect', { body: { returnTo: '/promotion/accounts' } });
    expect(r.status).toBe(200);
    expect(r.json.authUrl).toMatch(/^https:\/\/www\.facebook\.com\/v25\.0\/dialog\/oauth\?state=/);
    expect(OAuthState.rows).toHaveLength(1);
  });

  it('rejects an unknown provider and an unlisted return path', async () => {
    expect((await call('POST', '/accounts/tiktok/connect', { body: {} })).status).toBe(400);
    expect((await call('POST', '/accounts/meta/connect', { body: { returnTo: 'https://evil.test' } })).status).toBe(400);
  });

  it('completes the callback by redirecting to a FIXED frontend path, never to anything from the request', async () => {
    const start = await call('POST', '/accounts/meta/connect', { body: {} });
    const state = new URL(start.json.authUrl).searchParams.get('state');
    const r = await call('GET', `/oauth/meta/callback?state=${state}&code=CODE&returnTo=https://evil.test&redirect_uri=https://evil.test`);
    expect(r.status).toBe(303);
    const target = new URL(r.headers.get('location'));
    expect(target.origin).toBe(new URL(FRONTEND).origin);
    expect(target.pathname).toBe('/promotion/accounts');
    expect(target.searchParams.get('connect')).toBe('connected');
    expect(target.searchParams.get('count')).toBe('2');
    expect(r.headers.get('cache-control')).toBe('no-store');
    expect(r.headers.get('referrer-policy')).toBe('no-referrer');
    expect(r.headers.get('location')).not.toMatch(/CODE|SECRET|token/i);
    expect(PlatformAccount.rows.filter((a) => a.platform !== 'threads')).toHaveLength(2);
  });

  it('rejects a forged or replayed state with a redirect carrying only a result code', async () => {
    const forged = await call('GET', '/oauth/meta/callback?state=forged&code=CODE');
    expect(new URL(forged.headers.get('location')).searchParams.get('connect')).toBe('state');
    const start = await call('POST', '/accounts/meta/connect', { body: {} });
    const state = new URL(start.json.authUrl).searchParams.get('state');
    await call('GET', `/oauth/meta/callback?state=${state}&code=CODE`);
    const replay = await call('GET', `/oauth/meta/callback?state=${state}&code=CODE`);
    expect(new URL(replay.headers.get('location')).searchParams.get('connect')).toBe('state');
    expect(new URL((await call('GET', '/oauth/meta/callback')).headers.get('location')).searchParams.get('connect')).toBe('state');
  });

  it('reports a user who denied access', async () => {
    const start = await call('POST', '/accounts/threads/connect', { body: {} });
    const state = new URL(start.json.authUrl).searchParams.get('state');
    const r = await call('GET', `/oauth/threads/callback?state=${state}&error=access_denied&error_reason=user_denied`);
    expect(new URL(r.headers.get('location')).searchParams.get('connect')).toBe('denied');
  });

  it('disconnects an account', async () => {
    const r = await call('DELETE', `/accounts/${ACC.th}`);
    expect(r.json).toMatchObject({ disconnected: true, cancelledPosts: 0 });
    expect(PlatformAccount.rows).toHaveLength(0);
    expect((await call('DELETE', `/accounts/${ACC.th}`)).status).toBe(404);
  });
});

describe('cross-site request protection and validation', () => {
  it('refuses state-changing requests from another origin, allows reads, and allows non-browser clients', async () => {
    expect((await call('POST', '/campaigns', { body: {}, origin: 'https://evil.test' })).status).toBe(403);
    expect((await call('DELETE', `/accounts/${ACC.th}`, { origin: 'https://evil.test' })).status).toBe(403);
    expect(PlatformAccount.rows).toHaveLength(1);
    expect((await call('GET', '/accounts', { origin: 'https://evil.test' })).status).toBe(200);
    expect((await call('POST', '/campaigns', { body: {}, origin: null })).status).toBe(201);
  });

  it('answers 400 with field-level messages for malformed input and malformed ids', async () => {
    const bad = await call('POST', '/campaigns', { body: { videoJobId: 'not-an-id' } });
    expect(bad.status).toBe(400);
    expect(JSON.stringify(bad.json)).toMatch(/videoJobId/);
    expect((await call('GET', '/campaigns/not-an-id')).status).toBe(400);
    expect((await call('GET', '/posts/pac-aaaaaaaa')).status).toBe(400);
    expect((await call('GET', '/posts?limit=9999')).status).toBe(400);
  });

  it('does not leak stack traces or internals in error responses', async () => {
    const r = await call('GET', '/campaigns/cam-zzzzzzzz');
    expect(r.status).toBe(404);
    expect(r.text).not.toMatch(/at .*\.js|node_modules|stack/i);
  });
});

describe('publishing over HTTP', () => {
  const newCampaign = async () => (await call('POST', '/campaigns', { body: { videoJobId: 'job-aaaaaaaa' } })).json.campaign;

  it('requires confirm: true, then returns a per-destination result (201) and a clear 422 when nothing was created', async () => {
    const c = await newCampaign();
    const noConfirm = await call('POST', `/campaigns/${c._id}/publish`, { body: { mode: 'now', destinations: [{ accountId: ACC.th }] } });
    expect(noConfirm.status).toBe(400);

    const ok = await call('POST', `/campaigns/${c._id}/publish`, { body: { confirm: true, mode: 'now', destinations: [{ accountId: ACC.th }] } });
    expect(ok.status).toBe(422); // Threads video needs a public URL and none is configured
    expect(ok.json).toMatchObject({ created: 0, failed: 1 });
    expect(ok.json.results[0]).toMatchObject({ ok: false, code: 'VALIDATION_FAILED' });
  });

  it('creates posts and lists them with their allowed actions', async () => {
    const c = await newCampaign();
    await call('PATCH', `/campaigns/${c._id}`, { body: { clearMedia: true } });
    await call('PATCH', `/campaigns/${c._id}`, { body: { variants: { threads: { caption: 'Hello from Vireon' } } } });
    const r = await call('POST', `/campaigns/${c._id}/publish`, { body: { confirm: true, mode: 'schedule', timezone: 'UTC', localDateTime: '2099-01-01T10:00', destinations: [{ accountId: ACC.th }] } });
    expect(r.status).toBe(400); // beyond the 180-day scheduling window: a validation error, nothing is created
    const soon = new Date(Date.now() + 3 * 86400_000).toISOString().slice(0, 16);
    const ok = await call('POST', `/campaigns/${c._id}/publish`, { body: { confirm: true, mode: 'schedule', timezone: 'UTC', localDateTime: soon, destinations: [{ accountId: ACC.th }] } });
    expect(ok.status).toBe(201);
    const list = await call('GET', '/posts?status=SCHEDULED');
    expect(list.json.posts).toHaveLength(1);
    expect(list.json.posts[0]).toMatchObject({ platform: 'threads', status: 'SCHEDULED', actions: { canCancel: true, canEdit: true, canReschedule: true } });
    expect(list.text).not.toMatch(/SECRET|dedupeKey|"lease"/);

    const id = list.json.posts[0]._id;
    expect((await call('POST', `/posts/${id}/cancel`)).json.post.status).toBe('CANCELLED');
    expect((await call('POST', `/posts/${id}/cancel`)).status).toBe(409);
    expect((await call('POST', `/posts/${id}/retry`)).status).toBe(409);
  });

  it('validates a campaign without creating anything', async () => {
    const c = await newCampaign();
    const r = await call('POST', `/campaigns/${c._id}/validate`, { body: { destinations: [{ accountId: ACC.th }] } });
    expect(r.status).toBe(200);
    expect(r.json.results[0].errors.map((e) => e.code)).toContain('PUBLIC_MEDIA_UNAVAILABLE');
    expect(SocialPost.rows).toHaveLength(0);
  });

  it('serves calendar, analytics and overview', async () => {
    expect((await call('GET', '/calendar')).status).toBe(200);
    expect((await call('GET', '/analytics')).json.totals).toMatchObject({ posts: 0, successRate: null });
    expect((await call('GET', '/overview')).json.accounts).toEqual({ total: 1, needReauth: 0 });
    expect((await call('POST', '/analytics/refresh', { body: {} })).json).toEqual({ refreshed: 0, failed: 0, skipped: 0 });
  });
});

describe('media upload endpoint', () => {
  it('streams the body in, verifies it by content and attaches it', async () => {
    const c = (await call('POST', '/campaigns', { body: {} })).json.campaign;
    const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(8), Buffer.from([0, 0, 4, 56, 0, 0, 4, 56]), Buffer.alloc(100)]);
    const r = await call('PUT', `/campaigns/${c._id}/media`, { raw: png, headers: { 'Content-Type': 'image/png', 'X-File-Name': 'cover.png' } });
    expect(r.status).toBe(200);
    expect(r.json.campaign.media).toMatchObject({ kind: 'image', contentType: 'image/png', width: 1080, height: 1080, fileName: 'cover.png' });
    expect(r.text).not.toMatch(/"bucket"|"key"/);
  });

  it('refuses a wrong content type, and a file that is not what it claims to be', async () => {
    const c = (await call('POST', '/campaigns', { body: {} })).json.campaign;
    expect((await call('PUT', `/campaigns/${c._id}/media`, { raw: 'hello', headers: { 'Content-Type': 'text/html' } })).status).toBe(400);
    const fake = await call('PUT', `/campaigns/${c._id}/media`, { raw: Buffer.from('<html>not an image</html>'.repeat(10)), headers: { 'Content-Type': 'image/jpeg' } });
    expect(fake.status).toBe(400);
    expect(fake.text).toMatch(/Unsupported file/);
  });
});

describe('platform callbacks', () => {
  beforeEach(() => {
    PlatformAccount.seed({ ownerId: 'local', platform: 'facebook', externalId: 'P1', accessTokenEnc: cipher.encrypt('t'), meta: { fbUserId: 'FBUSER1' } });
    PlatformAccount.seed({ ownerId: 'local', platform: 'instagram', externalId: 'IG1', accessTokenEnc: cipher.encrypt('t'), meta: { fbUserId: 'FBUSER1' } });
    PlatformAccount.seed({ ownerId: 'local', platform: 'facebook', externalId: 'P2', accessTokenEnc: cipher.encrypt('t'), meta: { fbUserId: 'OTHERUSER' } });
  });

  it('honours a correctly signed deauthorize callback: removes that user\'s accounts only', async () => {
    const r = await call('POST', '/webhooks/meta/deauthorize', { origin: null, form: { signed_request: signed({ user_id: 'FBUSER1' }, appSecret) } });
    expect(r.status).toBe(200);
    expect(PlatformAccount.rows.map((a) => a.externalId).sort()).toEqual(['777', 'P2']);
  });

  it('ignores callbacks with a bad or foreign signature', async () => {
    for (const sr of [signed({ user_id: 'FBUSER1' }, 'wrong-secret'), 'garbage', '', `${signed({ user_id: 'FBUSER1' }, appSecret)}.extra`]) {
      const r = await call('POST', '/webhooks/meta/deauthorize', { origin: null, form: { signed_request: sr } });
      expect(r.status).toBe(400);
    }
    expect(PlatformAccount.rows).toHaveLength(4);
    // a Threads-signed request cannot be replayed against the Meta endpoint
    const cross = await call('POST', '/webhooks/meta/deauthorize', { origin: null, form: { signed_request: signed({ user_id: 'FBUSER1' }, 'threads-app-secret') } });
    expect(cross.status).toBe(400);
  });

  it('answers a data-deletion request with a confirmation code, deletes credentials and wipes handles from history', async () => {
    const fb = PlatformAccount.rows.find((a) => a.externalId === 'P1');
    SocialPost.seed({ ownerId: 'local', campaignId: 'cam-aaaaaaaa', platform: 'facebook', accountId: fb._id, accountLabel: 'Page', accountHandle: 'handle', status: 'COMPLETED', format: 'text', insights: { fetchedAt: new Date(), metrics: { views: { available: true, value: 1 } } } });
    SocialPost.seed({ ownerId: 'local', campaignId: 'cam-aaaaaaaa', platform: 'facebook', accountId: fb._id, status: 'SCHEDULED', format: 'text', dedupeKey: 'k', scheduledFor: new Date() });
    const r = await call('POST', '/webhooks/meta/data-deletion', { origin: null, form: { signed_request: signed({ user_id: 'FBUSER1' }, appSecret) } });
    expect(r.status).toBe(200);
    expect(r.json.confirmation_code).toMatch(/^[\w-]{8,}$/);
    expect(r.json.url).toContain(`${FRONTEND}/promotion?deletion=`);
    expect(PlatformAccount.rows.map((a) => a.externalId).sort()).toEqual(['777', 'P2']);
    expect(SocialPost.rows[0]).toMatchObject({ status: 'COMPLETED', accountLabel: '', accountHandle: '' });
    expect(SocialPost.rows[0].insights.metrics).toBeNull();
    expect(SocialPost.rows[1]).toMatchObject({ status: 'CANCELLED' });
  });

  it('serves signed media links on the public route and nothing else without a valid token', async () => {
    mockStorage.statObject.mockResolvedValue({ size: 4 });
    mockStorage.getObjectRange.mockResolvedValue(Buffer.from('data'));
    const url = gateway.publicMediaUrl({ bucket: OBJ.bucket, key: OBJ.key }, { settings: { publicMediaBaseUrl: base, mediaTokenTtlMs: 60_000 } });
    const ok = await fetch(url);
    expect(ok.status).toBe(200);
    expect(await ok.text()).toBe('data');
    expect((await fetch(`${base}/api/social/media/bad.token/x.mp4`)).status).toBe(404);
  });
});
