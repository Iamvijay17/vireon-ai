const mongoose = require('mongoose');

/**
 * One in-flight OAuth authorization. The browser only ever sees the random
 * `state` value; we keep its SHA-256 here (so a leaked database does not leak
 * usable states), together with the PKCE verifier. It is single-use (consumed
 * with findOneAndDelete) and expires on its own through the TTL index, so an
 * abandoned consent screen leaves nothing behind.
 */
const oauthStateSchema = new mongoose.Schema(
  {
    stateHash: { type: String, required: true, unique: true },
    ownerId: { type: String, required: true },
    platform: { type: String, required: true },
    // YouTube's PKCE verifier; flows without PKCE (Meta, Threads) leave it empty.
    codeVerifierEnc: { type: String, default: '' },
    // A path inside the SPA, validated against an allow-list before it is stored.
    returnTo: { type: String, default: '/publishing' },
    expiresAt: { type: Date, required: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

oauthStateSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model('OAuthState', oauthStateSchema);
