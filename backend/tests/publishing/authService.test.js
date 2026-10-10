jest.mock('../../src/services/common/LoggerService', () => ({
  info: jest.fn(), warn: jest.fn(), debug: jest.fn(), error: jest.fn(), success: jest.fn(), border: jest.fn(),
}));
jest.mock('../../src/services/publishing/PublishingEvents', () => ({ emitAccount: jest.fn(), emitJob: jest.fn() }));
jest.mock('../../src/models/PlatformAccount', () => {
  const model = require('./helpers/fakeMongo').makeAccountModel();
  model.ACCOUNT_STATUS = { CONNECTED: 'connected', NEEDS_REAUTH: 'needs_reauth' };
  return model;
});
jest.mock('../../src/models/OAuthState', () => require('./helpers/fakeMongo').makeStateModel());

const crypto = require('crypto');
const config = require('../../src/config');
const PlatformAccount = require('../../src/models/PlatformAccount');
const OAuthState = require('../../src/models/OAuthState');
const cipher = require('../../src/services/publishing/crypto');
const events = require('../../src/services/publishing/PublishingEvents');
const YouTubeAuthService = require('../../src/services/publishing/youtube/YouTubeAuthService');
const { REQUIRED_SCOPES } = require('../../src/services/publishing/youtube/constants');
const { PublishError } = require('../../src/services/publishing/errors');
const { NotFoundError, ValidationError } = require('../../src/utils/errors');

const KEY = crypto.randomBytes(32).toString('base64');
const OWNER = 'local';

const makeApi = (over = {}) => ({
  isConfigured: jest.fn(() => true),
  assertConfigured: jest.fn(),
  buildAuthUrl: jest.fn(({ state, codeChallenge }) => `https://accounts.example/auth?state=${state}&code_challenge=${codeChallenge}`),
  exchangeCode: jest.fn(async () => ({ accessToken: 'AT-1', refreshToken: 'RT-secret', expiresInSec: 3600, scopes: REQUIRED_SCOPES })),
  getMyChannel: jest.fn(async () => ({ id: 'UC123', title: 'My Channel', thumbnailUrl: 'https://img/x.png' })),
  refreshAccessToken: jest.fn(async () => ({ accessToken: 'AT-fresh', expiresInSec: 3600 })),
  revoke: jest.fn(async () => true),
  ...over,
});

const stateFromUrl = (url) => new URL(url).searchParams.get('state');

let clock;
beforeAll(() => { config.publishing.encryptionKey = KEY; });
beforeEach(() => {
  PlatformAccount.reset();
  OAuthState.reset();
  clock = Date.now();
  jest.clearAllMocks();
});

const service = (api = makeApi()) => ({ api, svc: new YouTubeAuthService({ api, now: () => clock }) });

describe('OAuth state', () => {
  it('stores only a hash of the state and the PKCE verifier encrypted', async () => {
    const { svc, api } = service();
    const { authUrl } = await svc.startConnect(OWNER);
    const state = stateFromUrl(authUrl);

    expect(OAuthState.rows).toHaveLength(1);
    const row = OAuthState.rows[0];
    expect(row.stateHash).toBe(cipher.sha256(state));
    expect(JSON.stringify(row)).not.toContain(state);
    expect(row.ownerId).toBe(OWNER);

    // PKCE: the challenge Google received is the S256 of the verifier we kept.
    const verifier = cipher.decrypt(row.codeVerifierEnc);
    expect(api.buildAuthUrl.mock.calls[0][0].codeChallenge).toBe(YouTubeAuthService.pkceChallenge(verifier));
  });

  it('generates a different unguessable state every time', async () => {
    const { svc } = service();
    const a = stateFromUrl((await svc.startConnect(OWNER)).authUrl);
    const b = stateFromUrl((await svc.startConnect(OWNER)).authUrl);
    expect(a).not.toBe(b);
    expect(a.length).toBeGreaterThanOrEqual(40);
  });

  it('refuses a return path outside the allow-list (no open redirect through the state record)', async () => {
    const { svc } = service();
    await expect(svc.startConnect(OWNER, { returnTo: 'https://evil.example/' })).rejects.toBeInstanceOf(ValidationError);
    await expect(svc.startConnect(OWNER, { returnTo: '//evil.example' })).rejects.toBeInstanceOf(ValidationError);
    await expect(svc.startConnect(OWNER, { returnTo: '/publishing/accounts' })).resolves.toBeDefined();
  });

  it('rejects a callback with an unknown state without ever contacting Google', async () => {
    const { svc, api } = service();
    const out = await svc.completeConnect({ state: 'forged-state', code: 'c' });
    expect(out.result).toBe('state');
    expect(api.exchangeCode).not.toHaveBeenCalled();
  });

  it('rejects a callback with no state at all, or an oversized one', async () => {
    const { svc } = service();
    expect((await svc.completeConnect({ code: 'c' })).result).toBe('state');
    expect((await svc.completeConnect({ state: 'x'.repeat(500), code: 'c' })).result).toBe('state');
  });

  it('is single-use: replaying a valid callback fails', async () => {
    const { svc, api } = service();
    const state = stateFromUrl((await svc.startConnect(OWNER)).authUrl);
    expect((await svc.completeConnect({ state, code: 'c' })).result).toBe('connected');
    expect((await svc.completeConnect({ state, code: 'c' })).result).toBe('state');
    expect(api.exchangeCode).toHaveBeenCalledTimes(1);
  });

  it('expires after ten minutes', async () => {
    const { svc } = service();
    const state = stateFromUrl((await svc.startConnect(OWNER)).authUrl);
    clock += 10 * 60_000 + 1000;
    expect((await svc.completeConnect({ state, code: 'c' })).result).toBe('state');
  });

  it('burns the state even when the user denied consent', async () => {
    const { svc } = service();
    const state = stateFromUrl((await svc.startConnect(OWNER)).authUrl);
    expect((await svc.completeConnect({ state, error: 'access_denied' })).result).toBe('denied');
    expect(OAuthState.rows).toHaveLength(0);
  });
});

describe('connecting an account', () => {
  const connect = async (svc, over = {}) => {
    const state = stateFromUrl((await svc.startConnect(OWNER)).authUrl);
    return svc.completeConnect({ state, code: 'auth-code', ...over });
  };

  it('stores the refresh token encrypted, never in plain text, and never returns it', async () => {
    const { svc } = service();
    const out = await connect(svc);

    expect(out.result).toBe('connected');
    expect(out.returnTo).toBe('/publishing');
    const [row] = PlatformAccount.rows;
    expect(row.refreshTokenEnc).toBeDefined();
    expect(row.refreshTokenEnc).not.toContain('RT-secret');
    expect(cipher.decrypt(row.refreshTokenEnc)).toBe('RT-secret');
    expect(row).toMatchObject({ ownerId: OWNER, platform: 'youtube', externalId: 'UC123', displayName: 'My Channel', status: 'connected' });
    expect(JSON.stringify(out.account.toJSON())).not.toMatch(/RT-secret|refreshTokenEnc/);
    expect(events.emitAccount).toHaveBeenCalled();
  });

  it('exchanges the code with the stored PKCE verifier', async () => {
    const { svc, api } = service();
    await connect(svc);
    const { codeVerifier, code } = api.exchangeCode.mock.calls[0][0];
    expect(code).toBe('auth-code');
    expect(codeVerifier.length).toBeGreaterThan(40);
  });

  it('refuses a connection where the user unticked a required permission, and revokes the grant', async () => {
    const { svc, api } = service(makeApi({ exchangeCode: jest.fn(async () => ({ accessToken: 'AT', refreshToken: 'RT', expiresInSec: 3600, scopes: [REQUIRED_SCOPES[0]] })) }));
    expect((await connect(svc)).result).toBe('scopes');
    expect(PlatformAccount.rows).toHaveLength(0);
    expect(api.revoke).toHaveBeenCalledWith('RT');
  });

  it('refuses a Google account with no YouTube channel', async () => {
    const { svc, api } = service(makeApi({ getMyChannel: jest.fn(async () => null) }));
    expect((await connect(svc)).result).toBe('no_channel');
    expect(PlatformAccount.rows).toHaveLength(0);
    expect(api.revoke).toHaveBeenCalled();
  });

  it('refuses a first connection that came without a refresh token', async () => {
    const { svc } = service(makeApi({ exchangeCode: jest.fn(async () => ({ accessToken: 'AT', refreshToken: null, expiresInSec: 3600, scopes: REQUIRED_SCOPES })) }));
    expect((await connect(svc)).result).toBe('no_refresh');
    expect(PlatformAccount.rows).toHaveLength(0);
  });

  it('reconnecting the same channel updates one row and clears needs_reauth', async () => {
    const { svc } = service();
    await connect(svc);
    PlatformAccount.rows[0].status = 'needs_reauth';
    PlatformAccount.rows[0].statusReason = 'revoked';
    await connect(svc);
    expect(PlatformAccount.rows).toHaveLength(1);
    expect(PlatformAccount.rows[0]).toMatchObject({ status: 'connected', statusReason: '' });
  });

  it('keeps the existing refresh token when a reconnect does not return a new one', async () => {
    const { svc, api } = service();
    await connect(svc);
    const before = PlatformAccount.rows[0].refreshTokenEnc;
    api.exchangeCode.mockResolvedValueOnce({ accessToken: 'AT2', refreshToken: null, expiresInSec: 3600, scopes: REQUIRED_SCOPES });
    expect((await connect(svc)).result).toBe('connected');
    expect(PlatformAccount.rows[0].refreshTokenEnc).toBe(before);
  });

  it('reports a token-exchange failure as a result code rather than throwing', async () => {
    const { svc } = service(makeApi({ exchangeCode: jest.fn(async () => { throw new PublishError('SERVER', 'boom'); }) }));
    expect((await connect(svc)).result).toBe('failed');
  });

  it('reports not_configured when Google credentials are missing', async () => {
    const { svc } = service(makeApi({ isConfigured: jest.fn(() => false) }));
    expect((await connect(svc)).result).toBe('not_configured');
  });
});

describe('account ownership and listing', () => {
  const seed = async (svc) => {
    const state = stateFromUrl((await svc.startConnect(OWNER)).authUrl);
    return (await svc.completeConnect({ state, code: 'c' })).account;
  };

  it('lists only the owner\'s accounts and never exposes credentials', async () => {
    const { svc } = service();
    await seed(svc);
    PlatformAccount.seed({ ownerId: 'someone-else', platform: 'youtube', externalId: 'UC999', displayName: 'Other', refreshTokenEnc: cipher.encrypt('x') });
    const accounts = await svc.listAccounts(OWNER);
    expect(accounts).toHaveLength(1);
    expect(JSON.stringify(accounts)).not.toMatch(/refreshTokenEnc|RT-secret|v1:/);
  });

  it('flags an account whose credential can no longer be decrypted (key changed)', async () => {
    const { svc } = service();
    await seed(svc);
    config.publishing.encryptionKey = crypto.randomBytes(32).toString('hex');
    try {
      const [account] = await svc.listAccounts(OWNER);
      expect(account.status).toBe('needs_reauth');
      expect(account.statusReason).toMatch(/PUBLISHING_TOKEN_ENCRYPTION_KEY/);
    } finally {
      config.publishing.encryptionKey = KEY;
    }
  });

  it('404s for another owner\'s account, exactly as for one that does not exist', async () => {
    const { svc } = service();
    const account = await seed(svc);
    await expect(svc.getAccount('someone-else', account._id)).rejects.toBeInstanceOf(NotFoundError);
    await expect(svc.disconnect('someone-else', account._id)).rejects.toBeInstanceOf(NotFoundError);
    await expect(svc.getAccount(OWNER, 'pac-missing1')).rejects.toBeInstanceOf(NotFoundError);
    expect(PlatformAccount.rows).toHaveLength(1);
  });

  it('disconnect revokes the grant at Google and deletes the stored credential', async () => {
    const { svc, api } = service();
    const account = await seed(svc);
    const out = await svc.disconnect(OWNER, account._id);
    expect(out.revoked).toBe(true);
    expect(api.revoke).toHaveBeenCalledWith('RT-secret');
    expect(PlatformAccount.rows).toHaveLength(0);
  });

  it('disconnect still removes the account when Google cannot be reached', async () => {
    const { svc } = service(makeApi({ revoke: jest.fn(async () => false) }));
    const account = await seed(svc);
    await expect(svc.disconnect(OWNER, account._id)).resolves.toEqual({ revoked: false });
    expect(PlatformAccount.rows).toHaveLength(0);
  });
});

describe('access tokens for workers', () => {
  const connected = async (svc) => {
    const state = stateFromUrl((await svc.startConnect(OWNER)).authUrl);
    return (await svc.completeConnect({ state, code: 'c' })).account._id;
  };

  it('reuses a valid token and refreshes after it expires', async () => {
    const { svc, api } = service();
    const id = await connected(svc);

    expect(await svc.getAccessToken(id)).toBe('AT-1'); // cached from the connect
    expect(api.refreshAccessToken).not.toHaveBeenCalled();

    clock += 3600_000;
    expect(await svc.getAccessToken(id)).toBe('AT-fresh');
    expect(api.refreshAccessToken).toHaveBeenCalledWith('RT-secret');
    expect(await svc.getAccessToken(id)).toBe('AT-fresh');
    expect(api.refreshAccessToken).toHaveBeenCalledTimes(1);
  });

  it('can be forced to refresh (token rejected by Google mid-upload)', async () => {
    const { svc, api } = service();
    const id = await connected(svc);
    await svc.getAccessToken(id, { forceRefresh: true });
    expect(api.refreshAccessToken).toHaveBeenCalledTimes(1);
  });

  it('marks the account needs_reauth when Google revoked the grant, then fails fast', async () => {
    const { svc, api } = service();
    const id = await connected(svc);
    clock += 3600_000;
    api.refreshAccessToken.mockRejectedValueOnce(new PublishError('AUTH_REVOKED', 'invalid_grant'));

    await expect(svc.getAccessToken(id)).rejects.toMatchObject({ code: 'AUTH_REVOKED', retryable: false });
    expect(PlatformAccount.rows[0].status).toBe('needs_reauth');
    expect(events.emitAccount).toHaveBeenCalled();

    api.refreshAccessToken.mockClear();
    await expect(svc.getAccessToken(id)).rejects.toMatchObject({ code: 'AUTH_REVOKED' });
    expect(api.refreshAccessToken).not.toHaveBeenCalled(); // no hammering Google with a dead token
  });

  it('does not change the account when this process merely has the wrong encryption key', async () => {
    const { svc } = service();
    const id = await connected(svc);
    svc.tokenCache.clear();
    config.publishing.encryptionKey = crypto.randomBytes(32).toString('hex');
    try {
      await expect(svc.getAccessToken(id)).rejects.toMatchObject({ code: 'CREDENTIALS_UNREADABLE', retryable: true });
      expect(PlatformAccount.rows[0].status).toBe('connected');
    } finally {
      config.publishing.encryptionKey = KEY;
    }
  });

  it('treats a deleted account as needing reconnection', async () => {
    const { svc } = service();
    await expect(svc.getAccessToken('pac-gone0001')).rejects.toMatchObject({ code: 'AUTH_REVOKED' });
  });

  it('passes transient refresh failures through unchanged (retryable, account untouched)', async () => {
    const { svc, api } = service();
    const id = await connected(svc);
    clock += 3600_000;
    api.refreshAccessToken.mockRejectedValueOnce(new PublishError('NETWORK', 'offline'));
    await expect(svc.getAccessToken(id)).rejects.toMatchObject({ code: 'NETWORK', retryable: true });
    expect(PlatformAccount.rows[0].status).toBe('connected');
  });
});
