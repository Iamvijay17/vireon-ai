const config = require('../../config');
const LoggerService = require('../common/LoggerService');
const PlatformAccount = require('../../models/PlatformAccount');
const OAuthState = require('../../models/OAuthState');
const SocialPost = require('../../models/SocialPost');
const cipher = require('../publishing/crypto');
const events = require('../publishing/PublishingEvents');
const { PublishError } = require('../publishing/errors');
const { NotFoundError, ValidationError } = require('../../utils/errors');
const { PUBLISH_STATUS, SOCIAL_PLATFORM } = require('../../constants');
const MetaApi = require('./MetaApi');
const ThreadsApi = require('./ThreadsApi');
const { META_REQUIRED_SCOPES, META_INSTAGRAM_REQUIRED_SCOPES, THREADS_SCOPES, RETURN_PATHS } = require('./constants');

const STATE_TTL_MS = 10 * 60_000;
const SOCIAL_PLATFORMS = Object.values(SOCIAL_PLATFORM);
const PROVIDERS = Object.freeze({ meta: 'meta', threads: 'threads' });
// Threads refuses to refresh a token younger than 24 hours.
const MIN_REFRESH_AGE_MS = 24 * 3600_000;

/** Reasons the callback can report to the SPA - a fixed vocabulary, never echoed from the request. */
const CONNECT_RESULTS = Object.freeze({
  connected: 'connected',
  denied: 'denied',
  state: 'state',
  scopes: 'scopes',
  noPages: 'no_pages',
  notConfigured: 'not_configured',
  failed: 'failed',
});

const REAUTH_REASON = {
  facebook: 'Facebook no longer accepts this Page\'s saved access (the token was revoked or expired, a role changed, or the password was reset). Reconnect to continue.',
  instagram: 'Meta no longer accepts this Instagram account\'s saved access (revoked, expired, or the linked Page changed). Reconnect to continue.',
  threads: 'Threads no longer accepts this account\'s saved access (it expired or was revoked). Reconnect to continue.',
};

/**
 * Connects and maintains the social accounts: Facebook Pages + the Instagram
 * professional accounts linked to them (one Meta Facebook-Login flow), and
 * Threads profiles (its own OAuth).
 *
 * Security properties, in one place:
 *  - `state` is a 256-bit random value; only its SHA-256 is stored, it is single-use
 *    (findOneAndDelete) and expires after 10 minutes, so the callback cannot be
 *    forged, replayed or used cross-site.
 *  - The code exchange, the app secret and every token stay on the server. The browser only
 *    ever sees the platform's consent screen and a redirect back to a FIXED frontend path.
 *  - Tokens are stored AES-256-GCM encrypted (select:false) and are decrypted only inside
 *    getAccessToken(), for the worker / validation call that needs them.
 *  - A platform that stops honouring a token flips the account to `needs_reauth` and tells
 *    the dashboard; further posts fail fast with an actionable message instead of retrying.
 */
class SocialAuthService {
  constructor({ meta = new MetaApi(), threads = new ThreadsApi(), now = () => Date.now(), settings = () => config.social } = {}) {
    this.meta = meta;
    this.threads = threads;
    this.now = now;
    this.settings = settings;
  }

  isConfigured(provider) {
    return provider === PROVIDERS.threads ? this.threads.isConfigured() : this.meta.isConfigured();
  }

  // ── Connect ──────────────────────────────────────────────────────────────

  async startConnect(ownerId, provider, { returnTo = '/promotion/accounts' } = {}) {
    if (!PROVIDERS[provider]) throw new ValidationError('Unknown provider');
    const api = provider === PROVIDERS.threads ? this.threads : this.meta;
    api.assertConfigured();
    if (!RETURN_PATHS.has(returnTo)) throw new ValidationError('Unsupported return path');

    const state = cipher.randomToken(32);
    const expiresAt = new Date(this.now() + STATE_TTL_MS);
    await OAuthState.create({ stateHash: cipher.sha256(state), ownerId, platform: provider, returnTo, expiresAt });
    return { authUrl: api.buildAuthUrl({ state }), expiresAt };
  }

  /**
   * Finish from the platform's redirect. Always resolves to `{ result, returnTo, count }` - failures are a
   * result code for the SPA to explain, never a raw error page.
   */
  async completeConnect(provider, { state, code, error }) {
    const fail = (result, returnTo = '/promotion/accounts') => ({ result, returnTo, count: 0 });
    if (!PROVIDERS[provider]) return fail(CONNECT_RESULTS.failed);
    if (!state || typeof state !== 'string' || state.length > 200) return fail(CONNECT_RESULTS.state);

    // Consume first: whatever happens next, this state can never be replayed. It must belong to THIS provider.
    const record = await OAuthState.findOneAndDelete({ stateHash: cipher.sha256(state), platform: provider, expiresAt: { $gt: new Date(this.now()) } });
    if (!record) return fail(CONNECT_RESULTS.state);
    const returnTo = RETURN_PATHS.has(record.returnTo) ? record.returnTo : '/promotion/accounts';

    if (error) return fail(error === 'access_denied' ? CONNECT_RESULTS.denied : CONNECT_RESULTS.failed, returnTo);
    // Threads appends "#_" to the redirect; defensively drop anything that is not a plain code.
    const cleanCode = typeof code === 'string' ? code.replace(/#_$/, '') : '';
    if (!cleanCode || cleanCode.length > 2000) return fail(CONNECT_RESULTS.failed, returnTo);
    if (!this.isConfigured(provider)) return fail(CONNECT_RESULTS.notConfigured, returnTo);

    try {
      const outcome = provider === PROVIDERS.threads
        ? await this.#completeThreads(record.ownerId, cleanCode)
        : await this.#completeMeta(record.ownerId, cleanCode);
      return { ...outcome, returnTo };
    } catch (err) {
      LoggerService.warn('Social OAuth callback failed', { provider, code: err.code, status: err.httpStatus, message: err.message });
      return fail(CONNECT_RESULTS.failed, returnTo);
    }
  }

  async #completeMeta(ownerId, code) {
    const short = await this.meta.exchangeCode(code);
    const long = await this.meta.extendUserToken(short.accessToken);
    const userToken = long.accessToken;

    // Granular consent lets the user untick permissions; publishing would fail later, mid-post. Refuse now.
    const { granted } = await this.meta.getPermissions(userToken);
    const missing = META_REQUIRED_SCOPES.filter((s) => !granted.includes(s));
    if (missing.length) return { result: CONNECT_RESULTS.scopes, count: 0 };
    const instagramOk = META_INSTAGRAM_REQUIRED_SCOPES.every((s) => granted.includes(s));

    const me = await this.meta.getMe(userToken);
    const pages = await this.meta.listPages(userToken);
    let count = 0;
    for (const page of pages) {
      if (!page.accessToken) continue;
      // The person must be able to create content on the Page, or every post would be refused.
      if (page.tasks.length && !page.tasks.includes('CREATE_CONTENT')) continue;
      const baseMeta = { pageId: page.id, pageName: page.name, fbUserId: me.id };

      await this.#upsert(ownerId, {
        platform: SOCIAL_PLATFORM.FACEBOOK, externalId: page.id, displayName: page.name, username: '', thumbnailUrl: page.pictureUrl,
        scopes: granted, accessToken: page.accessToken, tokenExpiresAt: null, meta: baseMeta,
      });
      count += 1;

      if (page.instagram && instagramOk) {
        await this.#upsert(ownerId, {
          platform: SOCIAL_PLATFORM.INSTAGRAM, externalId: page.instagram.id, displayName: page.instagram.name || page.instagram.username,
          username: page.instagram.username, thumbnailUrl: page.instagram.pictureUrl, scopes: granted, accessToken: page.accessToken,
          tokenExpiresAt: null, meta: { ...baseMeta, igUserId: page.instagram.id },
        });
        count += 1;
      }
    }
    if (!count) return { result: CONNECT_RESULTS.noPages, count: 0 };
    return { result: CONNECT_RESULTS.connected, count };
  }

  async #completeThreads(ownerId, code) {
    const short = await this.threads.exchangeCode(code);
    const long = await this.threads.extendToken(short.accessToken);
    const profile = await this.threads.getProfile(long.accessToken);
    await this.#upsert(ownerId, {
      platform: SOCIAL_PLATFORM.THREADS, externalId: profile.id || short.userId, displayName: profile.name || profile.username,
      username: profile.username, thumbnailUrl: profile.pictureUrl, scopes: THREADS_SCOPES, accessToken: long.accessToken,
      tokenExpiresAt: new Date(this.now() + long.expiresInSec * 1000), meta: {},
    });
    return { result: CONNECT_RESULTS.connected, count: 1 };
  }

  async #upsert(ownerId, a) {
    const at = new Date(this.now());
    const account = await PlatformAccount.findOneAndUpdate(
      { ownerId, platform: a.platform, externalId: a.externalId },
      {
        $set: {
          displayName: a.displayName, username: a.username, thumbnailUrl: a.thumbnailUrl, scopes: a.scopes,
          accessTokenEnc: cipher.encrypt(a.accessToken), tokenExpiresAt: a.tokenExpiresAt, meta: a.meta,
          status: PlatformAccount.ACCOUNT_STATUS.CONNECTED, statusReason: '',
          connectedAt: at, lastRefreshedAt: at,
        },
      },
      { upsert: true, new: true }
    );
    events.emitAccount(account);
    LoggerService.info('Social account connected', { accountId: account._id, platform: a.platform });
    return account;
  }

  // ── Accounts ─────────────────────────────────────────────────────────────

  decorate(account) {
    const json = typeof account.toJSON === 'function' ? account.toJSON() : { ...account };
    delete json.refreshTokenEnc;
    delete json.accessTokenEnc;
    const readable = account.accessTokenEnc ? cipher.isReadable(account.accessTokenEnc) : true;
    if (json.status === PlatformAccount.ACCOUNT_STATUS.CONNECTED && !readable) {
      json.status = PlatformAccount.ACCOUNT_STATUS.NEEDS_REAUTH;
      json.statusReason = 'The stored credential cannot be decrypted with the current PUBLISHING_TOKEN_ENCRYPTION_KEY. Reconnect this account.';
    }
    if (json.tokenExpiresAt) {
      const days = Math.floor((new Date(json.tokenExpiresAt).getTime() - this.now()) / 86400_000);
      json.tokenExpiresInDays = days;
      if (days < 0 && json.status === PlatformAccount.ACCOUNT_STATUS.CONNECTED) {
        json.status = PlatformAccount.ACCOUNT_STATUS.NEEDS_REAUTH;
        json.statusReason = 'The saved access expired. Reconnect to continue.';
      }
    }
    return json;
  }

  async listAccounts(ownerId) {
    const accounts = await PlatformAccount.find({ ownerId, platform: { $in: SOCIAL_PLATFORMS } }).select('+accessTokenEnc').sort({ connectedAt: -1 });
    return accounts.map((a) => this.decorate(a));
  }

  async getAccount(ownerId, accountId) {
    const account = await PlatformAccount.findOne({ _id: accountId, ownerId, platform: { $in: SOCIAL_PLATFORMS } });
    if (!account) throw new NotFoundError('Account not found');
    return account;
  }

  /**
   * Disconnect: delete the stored credential and cancel anything still waiting to post through it.
   * Meta has no per-Page revoke (revoking the app grant would disconnect every Page at once), so the
   * platform-side grant is removed by the user in their Facebook / Instagram / Threads settings - the UI says so.
   */
  async disconnect(ownerId, accountId) {
    const account = await this.getAccount(ownerId, accountId);
    const pending = await SocialPost.find({
      ownerId, accountId, status: { $in: [PUBLISH_STATUS.SCHEDULED, PUBLISH_STATUS.QUEUED, PUBLISH_STATUS.RETRYING, PUBLISH_STATUS.DRAFT] },
    });
    const at = new Date(this.now());
    let cancelled = 0;
    for (const post of pending) {
      const res = await SocialPost.findOneAndUpdate(
        { _id: post._id, ownerId, status: post.status },
        {
          $set: { status: PUBLISH_STATUS.CANCELLED, cancelledAt: at, nextRetryAt: null },
          $unset: { dedupeKey: 1 },
          $push: { events: { $each: [{ at, status: PUBLISH_STATUS.CANCELLED, level: 'warn', message: 'Cancelled because the account was disconnected' }], $slice: -60 } },
        },
        { new: true }
      );
      if (res) cancelled += 1;
    }
    await PlatformAccount.deleteOne({ _id: accountId, ownerId });
    events.emitAccount({ _id: accountId, status: 'disconnected', statusReason: '' });
    LoggerService.info('Social account disconnected', { accountId, platform: account.platform, cancelled });
    return { cancelledPosts: cancelled };
  }

  /** Ask the platform whether the saved access still works; flips the account to needs_reauth if not. */
  async validate(ownerId, accountId) {
    const account = await this.getAccount(ownerId, accountId);
    try {
      const token = await this.getAccessToken(accountId);
      if (account.platform === SOCIAL_PLATFORM.THREADS) {
        await this.threads.getProfile(token);
      } else {
        const info = await this.meta.debugToken(token);
        if (!info.isValid) throw new PublishError('AUTH_REVOKED', info.errorMessage || 'Meta reports this token as invalid');
        const have = new Set(info.scopes);
        const needed = account.platform === SOCIAL_PLATFORM.INSTAGRAM ? [...META_REQUIRED_SCOPES, ...META_INSTAGRAM_REQUIRED_SCOPES] : META_REQUIRED_SCOPES;
        const missing = needed.filter((s) => !have.has(s));
        if (info.scopes.length && missing.length) {
          throw new PublishError('PERMISSION_DENIED', `Missing permission(s): ${missing.join(', ')}`);
        }
      }
      await PlatformAccount.updateOne({ _id: accountId }, { $set: { lastValidatedAt: new Date(this.now()) } });
      return { ok: true, account: this.decorate(await this.getAccount(ownerId, accountId)) };
    } catch (err) {
      if (err instanceof PublishError && err.requiresReauth) {
        await this.markNeedsReauth(accountId, err.code === 'PERMISSION_DENIED' ? `${err.message}. Reconnect and approve all permissions.` : REAUTH_REASON[account.platform]);
      }
      if (err instanceof PublishError) {
        return { ok: false, code: err.code, message: err.message, action: err.action, account: this.decorate(await this.getAccount(ownerId, accountId)) };
      }
      throw err;
    }
  }

  // ── Tokens for the workers ───────────────────────────────────────────────

  /**
   * The decrypted access token for the account. Threads tokens are refreshed
   * here when close to expiry; one that has expired fails fast as AUTH_REVOKED.
   * A token this process cannot decrypt (different key) is CREDENTIALS_UNREADABLE and
   * deliberately NOT persisted as needs_reauth - dev and prod can share a database,
   * and a process holding the wrong key must not flip the state for the one holding the right one.
   */
  async getAccessToken(accountId) {
    const account = await PlatformAccount.findById(accountId).select('+accessTokenEnc');
    if (!account || !SOCIAL_PLATFORMS.includes(account.platform)) throw new PublishError('AUTH_REVOKED', 'The account no longer exists - connect it again');
    if (account.status === PlatformAccount.ACCOUNT_STATUS.NEEDS_REAUTH) {
      throw new PublishError('AUTH_REVOKED', account.statusReason || 'This account needs to be reconnected');
    }
    if (account.tokenExpiresAt && new Date(account.tokenExpiresAt).getTime() <= this.now()) {
      await this.markNeedsReauth(accountId, 'The saved access expired. Reconnect to continue.');
      throw new PublishError('AUTH_REVOKED', 'The saved access for this account expired', { action: 'Reconnect the account in Promotion Studio > Accounts, then retry.' });
    }

    let token;
    try {
      token = cipher.decrypt(account.accessTokenEnc);
    } catch (err) {
      throw new PublishError('CREDENTIALS_UNREADABLE', err.message);
    }

    if (account.platform === SOCIAL_PLATFORM.THREADS && this.#shouldRefresh(account)) {
      try {
        return await this.#refreshThreads(account, token);
      } catch (err) {
        // A failed *proactive* refresh must not block a post with a token that still works.
        LoggerService.warn('Threads token refresh failed (continuing with the current token)', { accountId, code: err.code });
      }
    }
    PlatformAccount.updateOne({ _id: accountId }, { $set: { lastUsedAt: new Date(this.now()) } }).catch(() => {});
    return token;
  }

  #shouldRefresh(account) {
    if (!account.tokenExpiresAt) return false;
    const left = new Date(account.tokenExpiresAt).getTime() - this.now();
    const age = this.now() - new Date(account.lastRefreshedAt || account.connectedAt || 0).getTime();
    return left <= this.settings().tokenRefreshWindowMs && age >= MIN_REFRESH_AGE_MS;
  }

  async #refreshThreads(account, token) {
    const fresh = await this.threads.refreshToken(token);
    const at = new Date(this.now());
    await PlatformAccount.updateOne({ _id: account._id }, {
      $set: { accessTokenEnc: cipher.encrypt(fresh.accessToken), tokenExpiresAt: new Date(this.now() + fresh.expiresInSec * 1000), lastRefreshedAt: at, lastUsedAt: at },
    });
    LoggerService.info('Threads token refreshed', { accountId: account._id });
    return fresh.accessToken;
  }

  /**
   * Periodic maintenance (run by the social worker): refresh Threads tokens inside the refresh window,
   * and flip accounts whose token has already expired to needs_reauth so the dashboard says so before
   * the next post fails. Returns counts for the log.
   */
  async refreshDueTokens() {
    const horizon = new Date(this.now() + this.settings().tokenRefreshWindowMs);
    const due = await PlatformAccount.find({
      platform: SOCIAL_PLATFORM.THREADS, status: PlatformAccount.ACCOUNT_STATUS.CONNECTED, tokenExpiresAt: { $lte: horizon },
    }).select('+accessTokenEnc');
    const result = { refreshed: 0, expired: 0, failed: 0 };
    for (const account of due) {
      if (new Date(account.tokenExpiresAt).getTime() <= this.now()) {
        await this.markNeedsReauth(account._id, 'The saved access expired. Reconnect to continue.');
        result.expired += 1;
        continue;
      }
      if (!this.#shouldRefresh(account)) continue;
      try {
        await this.#refreshThreads(account, cipher.decrypt(account.accessTokenEnc));
        result.refreshed += 1;
      } catch (err) {
        if (err instanceof PublishError && err.requiresReauth) await this.markNeedsReauth(account._id, REAUTH_REASON.threads);
        result.failed += 1;
        LoggerService.warn('Threads token refresh failed', { accountId: account._id, code: err.code });
      }
    }
    return result;
  }

  async markNeedsReauth(accountId, reason) {
    const updated = await PlatformAccount.findByIdAndUpdate(
      accountId,
      { $set: { status: PlatformAccount.ACCOUNT_STATUS.NEEDS_REAUTH, statusReason: reason } },
      { new: true }
    );
    if (updated) {
      events.emitAccount(updated);
      LoggerService.warn('Social account needs reauthorization', { accountId, platform: updated.platform });
    }
    return updated;
  }
}

module.exports = SocialAuthService;
module.exports.CONNECT_RESULTS = CONNECT_RESULTS;
module.exports.PROVIDERS = PROVIDERS;
module.exports.REAUTH_REASON = REAUTH_REASON;
