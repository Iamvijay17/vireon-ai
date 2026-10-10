const crypto = require('crypto');
const config = require('../../config');
const LoggerService = require('../common/LoggerService');
const PlatformAccount = require('../../models/PlatformAccount');
const SocialPost = require('../../models/SocialPost');
const events = require('../publishing/PublishingEvents');
const { PUBLISH_STATUS, SOCIAL_PLATFORM } = require('../../constants');

/**
 * Meta's and Threads' mandatory platform callbacks:
 *
 *   deauthorize      the user removed the app in their Facebook / Instagram / Threads settings
 *   data deletion    the user asked Meta to delete the data the app holds about them
 *
 * Both arrive as a form POST carrying a `signed_request` = base64url(HMAC-SHA256 signature) "." base64url(JSON payload),
 * signed with the APP SECRET. A request whose signature does not verify is ignored. We hold no data beyond the
 * tokens and the handles shown in history, so honouring either callback means deleting the stored
 * credentials (the accounts) and wiping the account labels / handles / cached insights from past posts. The
 * posts themselves are the user's own content and stay.
 *
 * Content-event webhooks (new comments, etc.) are deliberately NOT used: publishing status is polled by the
 * worker, and this app needs nothing pushed. Note these callbacks can only reach a deployment that Meta can reach
 * over the internet (see docs/social-promotion.md); on a private network they simply never arrive.
 */

const b64 = (s) => Buffer.from(s, 'base64url');

/** @returns {object|null} the payload when the signature is valid for `secret`, else null. */
function parseSignedRequest(signedRequest, secret) {
  if (typeof signedRequest !== 'string' || !secret || signedRequest.length > 4096) return null;
  const [sig, payload, extra] = signedRequest.split('.');
  if (!sig || !payload || extra !== undefined) return null;
  const expected = crypto.createHmac('sha256', secret).update(payload).digest();
  const given = b64(sig);
  if (given.length !== expected.length || !crypto.timingSafeEqual(given, expected)) return null;
  try {
    const data = JSON.parse(b64(payload).toString('utf8'));
    if (data.algorithm && String(data.algorithm).toUpperCase() !== 'HMAC-SHA256') return null;
    return data;
  } catch {
    return null;
  }
}

class SocialWebhooks {
  constructor({ settings = () => config.social, Accounts = PlatformAccount, Posts = SocialPost } = {}) {
    this.settings = settings;
    this.Accounts = Accounts;
    this.Posts = Posts;
  }

  #secretFor(provider) {
    return provider === 'threads' ? this.settings().threads.appSecret : this.settings().meta.appSecret;
  }

  /** Accounts that belong to the user a callback names. */
  async #accountsFor(provider, userId) {
    if (provider === 'threads') return this.Accounts.find({ platform: SOCIAL_PLATFORM.THREADS, externalId: String(userId) });
    return this.Accounts.find({ platform: { $in: [SOCIAL_PLATFORM.FACEBOOK, SOCIAL_PLATFORM.INSTAGRAM] }, 'meta.fbUserId': String(userId) });
  }

  async #remove(accounts, { wipePosts }) {
    const ids = accounts.map((a) => String(a._id));
    for (const account of accounts) {
      // Anything still waiting to post through a removed credential cannot succeed.
      await this.Posts.updateMany({ accountId: String(account._id), status: { $in: [PUBLISH_STATUS.SCHEDULED, PUBLISH_STATUS.QUEUED, PUBLISH_STATUS.RETRYING] } }, {
        $set: { status: PUBLISH_STATUS.CANCELLED, cancelledAt: new Date(), nextRetryAt: null },
        $unset: { dedupeKey: 1 },
        $push: { events: { $each: [{ at: new Date(), status: PUBLISH_STATUS.CANCELLED, level: 'warn', message: 'Cancelled because the platform reported the app was removed' }], $slice: -60 } },
      });
      if (wipePosts) {
        await this.Posts.updateMany({ accountId: String(account._id) }, { $set: { accountLabel: '', accountHandle: '', insights: { fetchedAt: null, metrics: null, error: '' } } });
      }
      await this.Accounts.deleteOne({ _id: account._id });
      events.emitAccount({ _id: account._id, status: 'disconnected', statusReason: '' });
    }
    return ids;
  }

  /** @returns {Promise<{ok: boolean, removed: number}>} ok=false when the signature is not valid */
  async deauthorize(provider, signedRequest) {
    const data = parseSignedRequest(signedRequest, this.#secretFor(provider));
    if (!data?.user_id) return { ok: false, removed: 0 };
    const removed = await this.#remove(await this.#accountsFor(provider, data.user_id), { wipePosts: false });
    LoggerService.info('Social deauthorize callback honoured', { provider, removed: removed.length });
    return { ok: true, removed: removed.length };
  }

  /** Returns the confirmation code Meta shows the user, or null when the signature is not valid. */
  async dataDeletion(provider, signedRequest) {
    const data = parseSignedRequest(signedRequest, this.#secretFor(provider));
    if (!data?.user_id) return null;
    const removed = await this.#remove(await this.#accountsFor(provider, data.user_id), { wipePosts: true });
    const code = crypto.randomBytes(9).toString('base64url');
    LoggerService.info('Social data-deletion callback honoured', { provider, removed: removed.length });
    return { code, removed: removed.length };
  }
}

module.exports = SocialWebhooks;
module.exports.parseSignedRequest = parseSignedRequest;
