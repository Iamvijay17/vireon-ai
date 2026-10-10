jest.mock('../../src/services/common/LoggerService', () => ({
  info: jest.fn(), warn: jest.fn(), debug: jest.fn(), error: jest.fn(), success: jest.fn(), border: jest.fn(),
}));
jest.mock('../../src/services/publishing/PublishingEvents', () => ({ emitJob: jest.fn(), emitAccount: jest.fn() }));
jest.mock('../../src/models/SocialPost', () => require('../publishing/helpers/fakeMongo').makeSocialPostModel());
jest.mock('../../src/models/PlatformAccount', () => {
  const model = require('../publishing/helpers/fakeMongo').makeAccountModel();
  model.ACCOUNT_STATUS = { CONNECTED: 'connected', NEEDS_REAUTH: 'needs_reauth' };
  return model;
});
jest.mock('../../src/models/OAuthState', () => require('../publishing/helpers/fakeMongo').makeStateModel());

const crypto = require('crypto');
const config = require('../../src/config');
const PlatformAccount = require('../../src/models/PlatformAccount');
const OAuthState = require('../../src/models/OAuthState');
const SocialPost = require('../../src/models/SocialPost');
const events = require('../../src/services/publishing/PublishingEvents');
const cipher = require('../../src/services/publishing/crypto');
const SocialAuthService = require('../../src/services/social/SocialAuthService');
const { PublishError } = require('../../src/services/publishing/errors');

const KEY = crypto.randomBytes(32).toString('base64');
const OTHER_KEY = crypto.randomBytes(32).toString('base64');
const OWNER = 'local';
const STRANGER = 'someone-else';
const DAY = 86400_000;

let clock; let meta; let threads; let auth;

const settings = () => ({ tokenRefreshWindowMs: 10 * DAY });
const page = (over = {}) => ({ id: 'P1', name: 'My Page', accessToken: 'PAGE-TOKEN-1', tasks: ['CREATE_CONTENT', 'MANAGE'], pictureUrl: 'https://img/p', instagram: { id: 'IG1', username: 'my_ig', name: 'My IG', pictureUrl: 'https://img/i' }, ...over });

beforeAll(() => { config.publishing.encryptionKey = KEY; });
beforeEach(() => {
  PlatformAccount.reset(); OAuthState.reset(); SocialPost.reset();
  jest.clearAllMocks();
  clock = Date.parse('2026-10-10T12:00:00Z');
  meta = {
    isConfigured: jest.fn(() => true),
    assertConfigured: jest.fn(),
    buildAuthUrl: jest.fn(({ state }) => `https://www.facebook.com/dialog/oauth?state=${state}`),
    exchangeCode: jest.fn(async () => ({ accessToken: 'SHORT-USER' })),
    extendUserToken: jest.fn(async () => ({ accessToken: 'LONG-USER' })),
    getPermissions: jest.fn(async () => ({ granted: ['pages_show_list', 'pages_manage_posts', 'instagram_basic', 'instagram_content_publish'], declined: [] })),
    getMe: jest.fn(async () => ({ id: 'FBUSER1', name: 'Vijay' })),
    listPages: jest.fn(async () => [page()]),
    debugToken: jest.fn(async () => ({ isValid: true, scopes: ['pages_show_list', 'pages_manage_posts', 'instagram_basic', 'instagram_content_publish'], expiresAt: null })),
  };
  threads = {
    isConfigured: jest.fn(() => true),
    assertConfigured: jest.fn(),
    buildAuthUrl: jest.fn(({ state }) => `https://threads.com/oauth/authorize?state=${state}`),
    exchangeCode: jest.fn(async () => ({ accessToken: 'SHORT-TH', userId: '777' })),
    extendToken: jest.fn(async () => ({ accessToken: 'LONG-TH', expiresInSec: 60 * 86400 })),
    refreshToken: jest.fn(async () => ({ accessToken: 'REFRESHED-TH', expiresInSec: 60 * 86400 })),
    getProfile: jest.fn(async () => ({ id: '777', username: 'vijay', name: 'Vijay', pictureUrl: 'https://img/t' })),
  };
  auth = new SocialAuthService({ meta, threads, now: () => clock, settings });
});

const startAndGetState = async (provider = 'meta', ownerId = OWNER) => {
  await auth.startConnect(ownerId, provider);
  const url = (provider === 'meta' ? meta : threads).buildAuthUrl.mock.calls.at(-1)[0];
  return url.state;
};

describe('starting a connection', () => {
  it('stores only a hash of the state, with an expiry, and returns the platform consent URL', async () => {
    const { authUrl, expiresAt } = await auth.startConnect(OWNER, 'meta');
    const state = new URL(authUrl).searchParams.get('state');
    expect(state.length).toBeGreaterThanOrEqual(40);
    expect(OAuthState.rows).toHaveLength(1);
    const row = OAuthState.rows[0];
    expect(row.stateHash).toBe(cipher.sha256(state));
    expect(JSON.stringify(row)).not.toContain(state);
    expect(row).toMatchObject({ ownerId: OWNER, platform: 'meta', returnTo: '/promotion/accounts' });
    expect(new Date(expiresAt).getTime()).toBe(clock + 10 * 60_000);
  });

  it('refuses an unknown provider, an unlisted return path, and an unconfigured platform', async () => {
    await expect(auth.startConnect(OWNER, 'tiktok')).rejects.toThrow(/provider/);
    await expect(auth.startConnect(OWNER, 'meta', { returnTo: 'https://evil.test' })).rejects.toThrow(/return path/);
    await expect(auth.startConnect(OWNER, 'meta', { returnTo: '//evil.test' })).rejects.toThrow(/return path/);
    meta.assertConfigured.mockImplementation(() => { throw new PublishError('NOT_CONFIGURED', 'not configured'); });
    await expect(auth.startConnect(OWNER, 'meta')).rejects.toMatchObject({ code: 'NOT_CONFIGURED' });
    expect(OAuthState.rows).toHaveLength(0);
  });
});

describe('OAuth state validation', () => {
  it('rejects a missing, unknown, oversized or non-string state without touching the platform', async () => {
    for (const state of [undefined, '', 'nope', 'x'.repeat(500), 42]) {
      expect(await auth.completeConnect('meta', { state, code: 'C' })).toMatchObject({ result: 'state' });
    }
    expect(meta.exchangeCode).not.toHaveBeenCalled();
  });

  it('is single-use: a replayed callback is rejected', async () => {
    const state = await startAndGetState();
    expect(await auth.completeConnect('meta', { state, code: 'C' })).toMatchObject({ result: 'connected' });
    expect(await auth.completeConnect('meta', { state, code: 'C' })).toMatchObject({ result: 'state' });
    expect(meta.exchangeCode).toHaveBeenCalledTimes(1);
  });

  it('expires after 10 minutes', async () => {
    const state = await startAndGetState();
    clock += 10 * 60_000 + 1;
    expect(await auth.completeConnect('meta', { state, code: 'C' })).toMatchObject({ result: 'state' });
    expect(meta.exchangeCode).not.toHaveBeenCalled();
  });

  it('cannot be completed through the other provider\'s callback', async () => {
    const state = await startAndGetState('meta');
    expect(await auth.completeConnect('threads', { state, code: 'C' })).toMatchObject({ result: 'state' });
    expect(threads.exchangeCode).not.toHaveBeenCalled();
  });

  it('is consumed even when the user denied access, and reports "denied"', async () => {
    const state = await startAndGetState();
    expect(await auth.completeConnect('meta', { state, error: 'access_denied' })).toMatchObject({ result: 'denied', returnTo: '/promotion/accounts' });
    expect(OAuthState.rows).toHaveLength(0);
    expect(PlatformAccount.rows).toHaveLength(0);
  });

  it('reports a missing code as a failure and always returns an allow-listed path', async () => {
    const state = await startAndGetState();
    const out = await auth.completeConnect('meta', { state, code: '' });
    expect(out.result).toBe('failed');
    expect(['/promotion', '/promotion/accounts', '/promotion/create', '/promotion/posts']).toContain(out.returnTo);
  });

  it('strips Threads\' trailing "#_" from the code', async () => {
    const state = await startAndGetState('threads');
    await auth.completeConnect('threads', { state, code: 'ABC123#_' });
    expect(threads.exchangeCode).toHaveBeenCalledWith('ABC123');
  });
});

describe('connecting Facebook Pages and Instagram', () => {
  it('creates a Facebook account and the linked Instagram account, with tokens encrypted at rest', async () => {
    const state = await startAndGetState();
    const out = await auth.completeConnect('meta', { state, code: 'C' });
    expect(out).toMatchObject({ result: 'connected', count: 2 });
    expect(PlatformAccount.rows.map((r) => r.platform).sort()).toEqual(['facebook', 'instagram']);

    for (const row of PlatformAccount.rows) {
      expect(row.accessTokenEnc).toMatch(/^v1:/);
      expect(row.accessTokenEnc).not.toContain('PAGE-TOKEN-1');
      expect(JSON.stringify(row)).not.toContain('PAGE-TOKEN-1');
      expect(cipher.decrypt(row.accessTokenEnc)).toBe('PAGE-TOKEN-1');
      expect(row).toMatchObject({ ownerId: OWNER, status: 'connected', tokenExpiresAt: null });
      expect(row.meta).toMatchObject({ pageId: 'P1', fbUserId: 'FBUSER1' });
    }
    expect(PlatformAccount.rows.find((r) => r.platform === 'instagram')).toMatchObject({ externalId: 'IG1', username: 'my_ig' });
    expect(meta.exchangeCode).toHaveBeenCalledWith('C');
    expect(meta.extendUserToken).toHaveBeenCalledWith('SHORT-USER');
    expect(meta.listPages).toHaveBeenCalledWith('LONG-USER');
  });

  it('never returns a token from listAccounts', async () => {
    await auth.completeConnect('meta', { state: await startAndGetState(), code: 'C' });
    const accounts = await auth.listAccounts(OWNER);
    expect(accounts).toHaveLength(2);
    const text = JSON.stringify(accounts);
    expect(text).not.toContain('PAGE-TOKEN-1');
    expect(text).not.toMatch(/accessTokenEnc|refreshTokenEnc|v1:/);
  });

  it('refuses a connection whose required permissions were unticked, and stores nothing', async () => {
    meta.getPermissions.mockResolvedValue({ granted: ['pages_show_list'], declined: ['pages_manage_posts'] });
    const out = await auth.completeConnect('meta', { state: await startAndGetState(), code: 'C' });
    expect(out.result).toBe('scopes');
    expect(PlatformAccount.rows).toHaveLength(0);
    expect(meta.listPages).not.toHaveBeenCalled();
  });

  it('connects only the Facebook Page when the Instagram permissions were not granted', async () => {
    meta.getPermissions.mockResolvedValue({ granted: ['pages_show_list', 'pages_manage_posts'], declined: ['instagram_content_publish'] });
    const out = await auth.completeConnect('meta', { state: await startAndGetState(), code: 'C' });
    expect(out).toMatchObject({ result: 'connected', count: 1 });
    expect(PlatformAccount.rows.map((r) => r.platform)).toEqual(['facebook']);
  });

  it('skips Pages where the person cannot create content', async () => {
    meta.listPages.mockResolvedValue([page({ tasks: ['ANALYZE'] }), page({ id: 'P2', name: 'Second', accessToken: 'PT2', instagram: null })]);
    const out = await auth.completeConnect('meta', { state: await startAndGetState(), code: 'C' });
    expect(out.count).toBe(1);
    expect(PlatformAccount.rows.map((r) => r.externalId)).toEqual(['P2']);
  });

  it('reports "no_pages" when the user granted no usable Page', async () => {
    meta.listPages.mockResolvedValue([]);
    expect((await auth.completeConnect('meta', { state: await startAndGetState(), code: 'C' })).result).toBe('no_pages');
  });

  it('reconnecting updates the same rows (and clears needs_reauth) instead of duplicating', async () => {
    await auth.completeConnect('meta', { state: await startAndGetState(), code: 'C' });
    await auth.markNeedsReauth(PlatformAccount.rows[0]._id, 'revoked');
    meta.listPages.mockResolvedValue([page({ accessToken: 'PAGE-TOKEN-2' })]);
    await auth.completeConnect('meta', { state: await startAndGetState(), code: 'C2' });
    expect(PlatformAccount.rows).toHaveLength(2);
    for (const row of PlatformAccount.rows) {
      expect(row.status).toBe('connected');
      expect(row.statusReason).toBe('');
      expect(cipher.decrypt(row.accessTokenEnc)).toBe('PAGE-TOKEN-2');
    }
  });

  it('turns a platform failure during the exchange into a "failed" result, with no account stored and no secret leaked', async () => {
    meta.exchangeCode.mockRejectedValue(new PublishError('UNKNOWN', 'boom client_secret=ABC'));
    const out = await auth.completeConnect('meta', { state: await startAndGetState(), code: 'C' });
    expect(out.result).toBe('failed');
    expect(PlatformAccount.rows).toHaveLength(0);
    expect(JSON.stringify(out)).not.toContain('ABC');
  });

  it('reports "not_configured" without calling the platform', async () => {
    const state = await startAndGetState();
    meta.isConfigured.mockReturnValue(false);
    expect((await auth.completeConnect('meta', { state, code: 'C' })).result).toBe('not_configured');
    expect(meta.exchangeCode).not.toHaveBeenCalled();
  });
});

describe('connecting Threads', () => {
  it('stores the long-lived token encrypted, with its 60-day expiry', async () => {
    const out = await auth.completeConnect('threads', { state: await startAndGetState('threads'), code: 'C' });
    expect(out).toMatchObject({ result: 'connected', count: 1 });
    const row = PlatformAccount.rows[0];
    expect(row).toMatchObject({ platform: 'threads', externalId: '777', username: 'vijay' });
    expect(cipher.decrypt(row.accessTokenEnc)).toBe('LONG-TH');
    expect(row.accessTokenEnc).not.toContain('LONG-TH');
    expect(new Date(row.tokenExpiresAt).getTime()).toBe(clock + 60 * DAY);
  });
});

describe('ownership', () => {
  beforeEach(async () => {
    await auth.completeConnect('meta', { state: await startAndGetState(), code: 'C' });
    await auth.completeConnect('threads', { state: await startAndGetState('threads', STRANGER), code: 'C' });
  });

  it('lists only the caller\'s own accounts', async () => {
    expect((await auth.listAccounts(OWNER)).map((a) => a.platform).sort()).toEqual(['facebook', 'instagram']);
    expect((await auth.listAccounts(STRANGER)).map((a) => a.platform)).toEqual(['threads']);
    expect(await auth.listAccounts('nobody')).toEqual([]);
  });

  it('answers 404 for another owner\'s account on get, validate and disconnect', async () => {
    const theirs = PlatformAccount.rows.find((r) => r.ownerId === STRANGER)._id;
    await expect(auth.getAccount(OWNER, theirs)).rejects.toMatchObject({ status: 404 });
    await expect(auth.validate(OWNER, theirs)).rejects.toMatchObject({ status: 404 });
    await expect(auth.disconnect(OWNER, theirs)).rejects.toMatchObject({ status: 404 });
    expect(PlatformAccount.rows.some((r) => r._id === theirs)).toBe(true);
  });

  it('ignores YouTube channels stored in the same collection', async () => {
    PlatformAccount.seed({ ownerId: OWNER, platform: 'youtube', externalId: 'UC1', refreshTokenEnc: cipher.encrypt('RT') });
    expect((await auth.listAccounts(OWNER)).map((a) => a.platform)).not.toContain('youtube');
    const yt = PlatformAccount.rows.find((r) => r.platform === 'youtube')._id;
    await expect(auth.disconnect(OWNER, yt)).rejects.toMatchObject({ status: 404 });
  });
});

describe('disconnecting', () => {
  it('deletes the stored credential and cancels what was still waiting to post through it', async () => {
    await auth.completeConnect('meta', { state: await startAndGetState(), code: 'C' });
    const fb = PlatformAccount.rows.find((r) => r.platform === 'facebook');
    SocialPost.seed({ ownerId: OWNER, accountId: fb._id, platform: 'facebook', status: 'SCHEDULED', dedupeKey: 'd1', campaignId: 'cam-aaaaaaaa' });
    SocialPost.seed({ ownerId: OWNER, accountId: fb._id, platform: 'facebook', status: 'COMPLETED', dedupeKey: 'd2', campaignId: 'cam-aaaaaaaa' });

    const result = await auth.disconnect(OWNER, fb._id);
    expect(result).toEqual({ cancelledPosts: 1 });
    expect(PlatformAccount.rows.find((r) => r._id === fb._id)).toBeUndefined();
    const [scheduled, completed] = SocialPost.rows;
    expect(scheduled).toMatchObject({ status: 'CANCELLED' });
    expect(scheduled.dedupeKey).toBeUndefined();
    expect(completed.status).toBe('COMPLETED'); // published history is untouched
    expect(events.emitAccount).toHaveBeenCalledWith(expect.objectContaining({ status: 'disconnected' }));
  });
});

describe('access tokens for the worker', () => {
  const seedThreads = (over = {}) => PlatformAccount.seed({
    ownerId: OWNER, platform: 'threads', externalId: '777', accessTokenEnc: cipher.encrypt('TH-TOKEN'),
    tokenExpiresAt: new Date(clock + 40 * DAY), connectedAt: new Date(clock - 20 * DAY), lastRefreshedAt: new Date(clock - 20 * DAY), ...over,
  });
  const seedPage = (over = {}) => PlatformAccount.seed({ ownerId: OWNER, platform: 'facebook', externalId: 'P1', accessTokenEnc: cipher.encrypt('PAGE-TOKEN-1'), tokenExpiresAt: null, ...over });

  it('decrypts and returns the token', async () => {
    const row = seedPage();
    expect(await auth.getAccessToken(row._id)).toBe('PAGE-TOKEN-1');
  });

  it('fails fast, with an actionable message, for an account that needs reauthorisation or no longer exists', async () => {
    const row = seedPage({ status: 'needs_reauth', statusReason: 'Reconnect please' });
    await expect(auth.getAccessToken(row._id)).rejects.toMatchObject({ code: 'AUTH_REVOKED', requiresReauth: true, message: 'Reconnect please' });
    await expect(auth.getAccessToken('pac-nonexist')).rejects.toMatchObject({ code: 'AUTH_REVOKED' });
  });

  it('flags an expired token as needing reauthorisation and tells the dashboard', async () => {
    const row = seedThreads({ tokenExpiresAt: new Date(clock - 1000) });
    await expect(auth.getAccessToken(row._id)).rejects.toMatchObject({ code: 'AUTH_REVOKED' });
    expect(PlatformAccount.rows[0].status).toBe('needs_reauth');
    expect(events.emitAccount).toHaveBeenCalled();
  });

  it('a token this process cannot decrypt is CREDENTIALS_UNREADABLE and does NOT flip the shared account state', async () => {
    const row = seedPage({ accessTokenEnc: cipher.encrypt('PAGE-TOKEN-1', OTHER_KEY) });
    await expect(auth.getAccessToken(row._id)).rejects.toMatchObject({ code: 'CREDENTIALS_UNREADABLE' });
    expect(PlatformAccount.rows[0].status).toBe('connected');
  });

  it('refreshes a Threads token inside the refresh window and stores the new one encrypted', async () => {
    const row = seedThreads({ tokenExpiresAt: new Date(clock + 5 * DAY) });
    expect(await auth.getAccessToken(row._id)).toBe('REFRESHED-TH');
    expect(threads.refreshToken).toHaveBeenCalledWith('TH-TOKEN');
    const stored = PlatformAccount.rows[0];
    expect(cipher.decrypt(stored.accessTokenEnc)).toBe('REFRESHED-TH');
    expect(new Date(stored.tokenExpiresAt).getTime()).toBe(clock + 60 * DAY);
  });

  it('does not refresh outside the window, or a token younger than 24 hours', async () => {
    const early = seedThreads();
    expect(await auth.getAccessToken(early._id)).toBe('TH-TOKEN');
    PlatformAccount.reset();
    const young = seedThreads({ tokenExpiresAt: new Date(clock + 5 * DAY), lastRefreshedAt: new Date(clock - 3600_000) });
    expect(await auth.getAccessToken(young._id)).toBe('TH-TOKEN');
    expect(threads.refreshToken).not.toHaveBeenCalled();
  });

  it('keeps using a still-valid token when the proactive refresh fails', async () => {
    threads.refreshToken.mockRejectedValue(new PublishError('NETWORK', 'down'));
    const row = seedThreads({ tokenExpiresAt: new Date(clock + 5 * DAY) });
    expect(await auth.getAccessToken(row._id)).toBe('TH-TOKEN');
    expect(PlatformAccount.rows[0].status).toBe('connected');
  });

  it('maintenance refreshes what is due, flags what has expired and records what failed', async () => {
    seedThreads({ externalId: 'a', tokenExpiresAt: new Date(clock + 3 * DAY) });
    seedThreads({ externalId: 'b', tokenExpiresAt: new Date(clock - DAY) });
    seedThreads({ externalId: 'c', tokenExpiresAt: new Date(clock + 3 * DAY), accessTokenEnc: cipher.encrypt('BAD') });
    seedThreads({ externalId: 'far', tokenExpiresAt: new Date(clock + 50 * DAY) });
    threads.refreshToken.mockImplementation(async (t) => {
      if (t === 'BAD') throw new PublishError('AUTH_REVOKED', 'revoked');
      return { accessToken: 'NEW', expiresInSec: 60 * 86400 };
    });
    expect(await auth.refreshDueTokens()).toEqual({ refreshed: 1, expired: 1, failed: 1 });
    const byId = Object.fromEntries(PlatformAccount.rows.map((r) => [r.externalId, r.status]));
    expect(byId).toEqual({ a: 'connected', b: 'needs_reauth', c: 'needs_reauth', far: 'connected' });
  });
});

describe('validating a connection', () => {
  it('confirms a working account and records when it was checked', async () => {
    await auth.completeConnect('meta', { state: await startAndGetState(), code: 'C' });
    const fb = PlatformAccount.rows.find((r) => r.platform === 'facebook');
    const out = await auth.validate(OWNER, fb._id);
    expect(out.ok).toBe(true);
    expect(PlatformAccount.rows.find((r) => r._id === fb._id).lastValidatedAt).toBeInstanceOf(Date);
  });

  it('flags the account when the platform says the token is no longer valid', async () => {
    await auth.completeConnect('meta', { state: await startAndGetState(), code: 'C' });
    const fb = PlatformAccount.rows.find((r) => r.platform === 'facebook');
    meta.debugToken.mockResolvedValue({ isValid: false, scopes: [], errorMessage: 'Session has expired' });
    const out = await auth.validate(OWNER, fb._id);
    expect(out).toMatchObject({ ok: false, code: 'AUTH_REVOKED' });
    expect(PlatformAccount.rows.find((r) => r._id === fb._id).status).toBe('needs_reauth');
  });

  it('flags missing permissions as needing reauthorisation', async () => {
    await auth.completeConnect('meta', { state: await startAndGetState(), code: 'C' });
    const ig = PlatformAccount.rows.find((r) => r.platform === 'instagram');
    meta.debugToken.mockResolvedValue({ isValid: true, scopes: ['pages_show_list', 'pages_manage_posts'] });
    const out = await auth.validate(OWNER, ig._id);
    expect(out).toMatchObject({ ok: false, code: 'PERMISSION_DENIED' });
    expect(PlatformAccount.rows.find((r) => r._id === ig._id).status).toBe('needs_reauth');
  });

  it('validates a Threads account through its profile', async () => {
    await auth.completeConnect('threads', { state: await startAndGetState('threads'), code: 'C' });
    expect((await auth.validate(OWNER, PlatformAccount.rows[0]._id)).ok).toBe(true);
    threads.getProfile.mockRejectedValue(new PublishError('AUTH_REVOKED', 'expired'));
    expect((await auth.validate(OWNER, PlatformAccount.rows[0]._id)).ok).toBe(false);
    expect(PlatformAccount.rows[0].status).toBe('needs_reauth');
  });
});

describe('decorated accounts', () => {
  it('reports days until a Threads token expires and downgrades a lapsed one to needs_reauth', async () => {
    PlatformAccount.seed({ ownerId: OWNER, platform: 'threads', externalId: '1', accessTokenEnc: cipher.encrypt('t'), tokenExpiresAt: new Date(clock + 12.5 * DAY) });
    PlatformAccount.seed({ ownerId: OWNER, platform: 'threads', externalId: '2', accessTokenEnc: cipher.encrypt('t'), tokenExpiresAt: new Date(clock - DAY) });
    const [a, b] = await auth.listAccounts(OWNER);
    expect(a.tokenExpiresInDays).toBe(12);
    expect(b).toMatchObject({ status: 'needs_reauth' });
  });

  it('shows an account whose credential this process cannot decrypt as needing reconnection', async () => {
    PlatformAccount.seed({ ownerId: OWNER, platform: 'facebook', externalId: 'P1', accessTokenEnc: cipher.encrypt('t', OTHER_KEY) });
    const [a] = await auth.listAccounts(OWNER);
    expect(a.status).toBe('needs_reauth');
    expect(a.statusReason).toMatch(/PUBLISHING_TOKEN_ENCRYPTION_KEY/);
  });
});
