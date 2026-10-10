const mongoose = require('mongoose');
const { generatePlatformAccountId } = require('../utils/id');

const ACCOUNT_STATUS = Object.freeze({
  CONNECTED: 'connected',
  // Google revoked/expired the grant (user removed access, password change, 6
  // months unused...). Publishing is blocked until the account is reconnected.
  NEEDS_REAUTH: 'needs_reauth',
});

/**
 * A publishing destination the user connected through OAuth - today one
 * YouTube channel. The refresh token is the only credential kept, and only
 * encrypted (services/publishing/crypto.js); `select: false` keeps it out of
 * every query that doesn't explicitly ask for it, and toJSON drops it again as
 * a second line of defence, so it cannot reach an API response by accident.
 */
const platformAccountSchema = new mongoose.Schema(
  {
    _id: { type: String, default: generatePlatformAccountId },
    // Single-user app today: always the constant owner from
    // middleware/publishingGuard. Every query is scoped by it so wiring real
    // authentication later is a one-function change, not a rewrite.
    ownerId: { type: String, required: true, index: true },
    platform: { type: String, enum: ['youtube'], required: true },
    // The remote identity (YouTube channel id) - what makes reconnecting the
    // same channel update this row instead of creating a duplicate.
    externalId: { type: String, required: true },
    displayName: { type: String, default: '' },
    thumbnailUrl: { type: String, default: '' },
    scopes: { type: [String], default: [] },
    refreshTokenEnc: { type: String, required: true, select: false },
    status: { type: String, enum: Object.values(ACCOUNT_STATUS), default: ACCOUNT_STATUS.CONNECTED },
    // Why the account needs attention, in words the UI can show as-is.
    statusReason: { type: String, default: '' },
    connectedAt: { type: Date, default: Date.now },
    lastRefreshedAt: { type: Date, default: null },
    lastUsedAt: { type: Date, default: null },
  },
  {
    timestamps: true,
    toJSON: {
      transform(_doc, ret) {
        delete ret.__v;
        delete ret.refreshTokenEnc;
        return ret;
      },
    },
  }
);

platformAccountSchema.index({ ownerId: 1, platform: 1, externalId: 1 }, { unique: true });

const PlatformAccount = mongoose.model('PlatformAccount', platformAccountSchema);
PlatformAccount.ACCOUNT_STATUS = ACCOUNT_STATUS;
module.exports = PlatformAccount;
