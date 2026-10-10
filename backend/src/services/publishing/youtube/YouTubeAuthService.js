const crypto = require('crypto');
const LoggerService = require('../../common/LoggerService');
const PlatformAccount = require('../../../models/PlatformAccount');
const OAuthState = require('../../../models/OAuthState');
const cipher = require('../crypto');
const { PublishError } = require('../errors');
const { NotFoundError, ValidationError } = require('../../../utils/errors');
const { REQUIRED_SCOPES } = require('./constants');
const YouTubeApi = require('./YouTubeApi');
const events = require('../PublishingEvents');

const STATE_TTL_MS = 10 * 60_000;
// Refresh a little before expiry so a token never dies mid-request.
const TOKEN_SKEW_MS = 60_000;

// The only places the OAuth flow may send the browser back to. An allow-list
// (not a "starts with /" check) so neither the state record nor the callback
// can ever be steered to another origin or an unexpected route.
const RETURN_PATHS = new Set(['/publishing', '/publishing/accounts', '/publishing/publish', '/publishing/queue', '/publishing/udemy']);

/** Reasons the callback can report to the SPA - fixed vocabulary, never echoed from the request. */
const CONNECT_RESULTS = Object.freeze({
  connected: 'connected',
  denied: 'denied',
  state: 'state',
  scopes: 'scopes',
  noChannel: 'no_channel',
  noRefresh: 'no_refresh',
  notConfigured: 'not_configured',
  failed: 'failed',
});

const pkceChallenge = (verifier) => crypto.createHash('sha256').update(verifier).digest('base64url');

class YouTubeAuthService {
  constructor({ api = new YouTubeApi(), now = () => Date.now() } = {}) {
    this.api = api;
    this.now = now;
    // accountId -> { token, expiresAt }. In-memory only: access tokens live ~1h
    // and are cheap to mint again; nothing short-lived is written to the database.
    this.tokenCache = new Map();
  }

  isConfigured() {
    return this.api.isConfigured();
  }

  // ── Connect ──────────────────────────────────────────────────────────────

  /**
   * Begin the OAuth flow: create a single-use `state` (+ PKCE verifier),
   * remember its hash server-side, and return the Google consent URL.
   */
  async startConnect(ownerId, { returnTo = '/publishing' } = {}) {
    this.api.assertConfigured();
    if (!RETURN_PATHS.has(returnTo)) throw new ValidationError('Unsupported return path');

    const state = cipher.randomToken(32);
    const codeVerifier = cipher.randomToken(48);
    const expiresAt = new Date(this.now() + STATE_TTL_MS);

    await OAuthState.create({
      stateHash: cipher.sha256(state),
      ownerId,
      platform: 'youtube',
      codeVerifierEnc: cipher.encrypt(codeVerifier),
      returnTo,
      expiresAt,
    });

    return { authUrl: this.api.buildAuthUrl({ state, codeChallenge: pkceChallenge(codeVerifier) }), expiresAt };
  }

  /**
   * Finish the flow from Google's redirect. Always resolves to
   * `{ result, returnTo, account? }` - failures are reported as a result code
   * for the SPA to explain, never thrown as a raw error page, and the
   * destination is always an allow-listed path.
   */
  async completeConnect({ state, code, error }) {
    const fail = (result, returnTo = '/publishing') => ({ result, returnTo });

    if (!state || typeof state !== 'string' || state.length > 200) return fail(CONNECT_RESULTS.state);

    // Consume first: whatever happens next, this state can never be replayed.
    const record = await OAuthState.findOneAndDelete({ stateHash: cipher.sha256(state), expiresAt: { $gt: new Date(this.now()) } });
    if (!record) return fail(CONNECT_RESULTS.state);
    const returnTo = RETURN_PATHS.has(record.returnTo) ? record.returnTo : '/publishing';

    if (error) return fail(error === 'access_denied' ? CONNECT_RESULTS.denied : CONNECT_RESULTS.failed, returnTo);
    if (!code || typeof code !== 'string') return fail(CONNECT_RESULTS.failed, returnTo);
    if (!this.isConfigured()) return fail(CONNECT_RESULTS.notConfigured, returnTo);

    try {
      const tokens = await this.api.exchangeCode({ code, codeVerifier: cipher.decrypt(record.codeVerifierEnc) });

      // Granular consent lets the user untick scopes; a connection without
      // them would fail later, mid-upload. Refuse it now, and drop the grant.
      const missing = REQUIRED_SCOPES.filter((s) => !tokens.scopes.includes(s));
      if (missing.length) {
        await this.api.revoke(tokens.refreshToken || tokens.accessToken);
        return fail(CONNECT_RESULTS.scopes, returnTo);
      }

      const channel = await this.api.getMyChannel(tokens.accessToken);
      if (!channel) {
        await this.api.revoke(tokens.refreshToken || tokens.accessToken);
        return fail(CONNECT_RESULTS.noChannel, returnTo);
      }

      const existing = await PlatformAccount.findOne({ ownerId: record.ownerId, platform: 'youtube', externalId: channel.id }).select('+refreshTokenEnc');
      if (!tokens.refreshToken && !existing) {
        // Google only sends a refresh token on first consent (we force
        // prompt=consent, so this is unusual). Without one we cannot publish later.
        await this.api.revoke(tokens.accessToken);
        return fail(CONNECT_RESULTS.noRefresh, returnTo);
      }

      const fields = {
        displayName: channel.title,
        thumbnailUrl: channel.thumbnailUrl,
        scopes: tokens.scopes,
        status: PlatformAccount.ACCOUNT_STATUS.CONNECTED,
        statusReason: '',
        connectedAt: new Date(this.now()),
        lastRefreshedAt: new Date(this.now()),
        ...(tokens.refreshToken ? { refreshTokenEnc: cipher.encrypt(tokens.refreshToken) } : {}),
      };
      const account = await PlatformAccount.findOneAndUpdate(
        { ownerId: record.ownerId, platform: 'youtube', externalId: channel.id },
        { $set: fields },
        { upsert: true, new: true }
      );

      this.tokenCache.set(String(account._id), { token: tokens.accessToken, expiresAt: this.now() + tokens.expiresInSec * 1000 });
      events.emitAccount(account);
      LoggerService.info('YouTube account connected', { accountId: account._id, channelId: channel.id });
      return { result: CONNECT_RESULTS.connected, returnTo, account };
    } catch (err) {
      LoggerService.warn('YouTube OAuth callback failed', { code: err.code, status: err.httpStatus, message: err.message });
      return fail(CONNECT_RESULTS.failed, returnTo);
    }
  }

  // ── Accounts ─────────────────────────────────────────────────────────────

  async listAccounts(ownerId) {
    const accounts = await PlatformAccount.find({ ownerId }).select('+refreshTokenEnc').sort({ connectedAt: -1 });
    return accounts.map((a) => {
      const json = a.toJSON();
      // A key change/loss makes the stored token unreadable - say so up front
      // rather than at the first upload.
      if (a.status === 'connected' && !cipher.isReadable(a.refreshTokenEnc)) {
        json.status = PlatformAccount.ACCOUNT_STATUS.NEEDS_REAUTH;
        json.statusReason = 'The stored credential cannot be decrypted with the current PUBLISHING_TOKEN_ENCRYPTION_KEY. Reconnect this account.';
      }
      return json;
    });
  }

  async getAccount(ownerId, accountId) {
    const account = await PlatformAccount.findOne({ _id: accountId, ownerId });
    if (!account) throw new NotFoundError('Account not found');
    return account;
  }

  /** Disconnect: revoke at Google (best effort) and delete the stored credential. */
  async disconnect(ownerId, accountId) {
    const account = await PlatformAccount.findOne({ _id: accountId, ownerId }).select('+refreshTokenEnc');
    if (!account) throw new NotFoundError('Account not found');

    let revoked = false;
    try {
      revoked = await this.api.revoke(cipher.decrypt(account.refreshTokenEnc));
    } catch {
      // Unreadable token (key changed) - nothing we can revoke; still remove it locally.
    }
    await PlatformAccount.deleteOne({ _id: accountId, ownerId });
    this.tokenCache.delete(String(accountId));
    events.emitAccount({ _id: accountId, status: 'disconnected', statusReason: '' });
    LoggerService.info('YouTube account disconnected', { accountId, revoked });
    return { revoked };
  }

  // ── Access tokens for the workers ────────────────────────────────────────

  /**
   * A valid access token for the account, refreshing when needed. A grant
   * Google no longer honours flips the account to `needs_reauth` (so the UI
   * says "reconnect" and further jobs fail fast) before the error is rethrown.
   */
  async getAccessToken(accountId, { forceRefresh = false } = {}) {
    const key = String(accountId);
    const cached = this.tokenCache.get(key);
    if (!forceRefresh && cached && cached.expiresAt - TOKEN_SKEW_MS > this.now()) return cached.token;

    const account = await PlatformAccount.findById(accountId).select('+refreshTokenEnc');
    if (!account) throw new PublishError('AUTH_REVOKED', 'The publishing account no longer exists - connect it again');
    if (account.status === PlatformAccount.ACCOUNT_STATUS.NEEDS_REAUTH) {
      throw new PublishError('AUTH_REVOKED', account.statusReason || 'This account needs to be reconnected');
    }

    let refreshToken;
    try {
      refreshToken = cipher.decrypt(account.refreshTokenEnc);
    } catch (err) {
      // Deliberately NOT persisted as needs_reauth: dev and prod can share one
      // database, and a process holding the wrong key must not flip the
      // account's state for the process that holds the right one.
      throw new PublishError('CREDENTIALS_UNREADABLE', err.message);
    }

    try {
      const { accessToken, expiresInSec } = await this.api.refreshAccessToken(refreshToken);
      this.tokenCache.set(key, { token: accessToken, expiresAt: this.now() + expiresInSec * 1000 });
      PlatformAccount.updateOne({ _id: accountId }, { $set: { lastRefreshedAt: new Date(this.now()), lastUsedAt: new Date(this.now()) } }).catch(() => {});
      return accessToken;
    } catch (err) {
      this.tokenCache.delete(key);
      if (err instanceof PublishError && err.code === 'AUTH_REVOKED') {
        await this.#markNeedsReauth(account, 'Google no longer accepts the saved permission (revoked, expired, or removed in your Google account). Reconnect to continue.');
      }
      throw err;
    }
  }

  async #markNeedsReauth(account, reason) {
    const updated = await PlatformAccount.findByIdAndUpdate(
      account._id,
      { $set: { status: PlatformAccount.ACCOUNT_STATUS.NEEDS_REAUTH, statusReason: reason } },
      { new: true }
    );
    if (updated) events.emitAccount(updated);
  }
}

module.exports = YouTubeAuthService;
module.exports.CONNECT_RESULTS = CONNECT_RESULTS;
module.exports.RETURN_PATHS = RETURN_PATHS;
module.exports.pkceChallenge = pkceChallenge;
