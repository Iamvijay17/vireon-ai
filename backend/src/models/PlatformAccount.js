const mongoose = require('mongoose');
const { generatePlatformAccountId } = require('../utils/id');

const ACCOUNT_STATUS = Object.freeze({
  CONNECTED: 'connected',
  // The platform revoked/expired the grant (user removed access, password change, token
  // expired...). Publishing is blocked until the account is reconnected.
  NEEDS_REAUTH: 'needs_reauth',
});

const PLATFORMS = Object.freeze(['youtube', 'facebook', 'instagram', 'threads']);

/**
 * A publishing destination the user connected through OAuth: a YouTube channel,
 * a Facebook Page, an Instagram professional account or a Threads profile.
 * Each platform keeps exactly one credential, only encrypted
 * (services/publishing/crypto.js):
 *   - youtube          refreshTokenEnc  (Google refresh token)
 *   - facebook/instagram accessTokenEnc  (the Page access token)
 *   - threads          accessTokenEnc  (long-lived token, refreshed before `tokenExpiresAt`)
 * Both are `select: false` so they stay out of every query that doesn't explicitly
 * ask for them, and toJSON drops them again as a second line of defence, so a
 * credential cannot reach an API response by accident.
 */
const platformAccountSchema = new mongoose.Schema(
  {
    _id: { type: String, default: generatePlatformAccountId },
    // Single-user app today: always the constant owner from
    // middleware/publishingGuard. Every query is scoped by it so wiring real
    // authentication later is a one-function change, not a rewrite.
    ownerId: { type: String, required: true, index: true },
    platform: { type: String, enum: PLATFORMS, required: true },
    // The remote identity (YouTube channel id, Page id, Instagram user id, Threads user id) -
    // what makes reconnecting the same account update this row instead of creating a duplicate.
    externalId: { type: String, required: true },
    displayName: { type: String, default: '' },
    // @handle where the platform has one (Instagram / Threads).
    username: { type: String, default: '' },
    thumbnailUrl: { type: String, default: '' },
    scopes: { type: [String], default: [] },
    refreshTokenEnc: { type: String, required() { return this.platform === 'youtube'; }, select: false },
    accessTokenEnc: { type: String, default: '', select: false },
    // When the stored access token stops working (Threads: 60 days). null = no expiry known
    // (Page tokens derived from a long-lived user token carry none).
    tokenExpiresAt: { type: Date, default: null },
    // Platform specifics that are not secret: { pageId, pageName, igUserId, ... }.
    meta: { type: mongoose.Schema.Types.Mixed, default: {} },
    status: { type: String, enum: Object.values(ACCOUNT_STATUS), default: ACCOUNT_STATUS.CONNECTED },
    // Why the account needs attention, in words the UI can show as-is.
    statusReason: { type: String, default: '' },
    connectedAt: { type: Date, default: Date.now },
    lastRefreshedAt: { type: Date, default: null },
    lastUsedAt: { type: Date, default: null },
    lastValidatedAt: { type: Date, default: null },
  },
  {
    timestamps: true,
    toJSON: {
      transform(_doc, ret) {
        delete ret.__v;
        delete ret.refreshTokenEnc;
        delete ret.accessTokenEnc;
        return ret;
      },
    },
  }
);

platformAccountSchema.index({ ownerId: 1, platform: 1, externalId: 1 }, { unique: true });

const PlatformAccount = mongoose.model('PlatformAccount', platformAccountSchema);
PlatformAccount.ACCOUNT_STATUS = ACCOUNT_STATUS;
PlatformAccount.PLATFORMS = PLATFORMS;
module.exports = PlatformAccount;
