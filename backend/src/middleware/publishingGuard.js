const rateLimit = require('express-rate-limit');
const config = require('../config');

/**
 * Protection for the publishing routes - the only part of the API that holds
 * credentials for a third-party account and can act on it.
 *
 * Vireon has NO authentication (middleware/auth.js is a documented
 * pass-through; it is a single-user tool for a trusted machine/LAN), so this
 * does not pretend to authenticate anyone. What it does:
 *
 *  - Owner scoping: every request is attributed to one owner id and every
 *    query downstream is filtered by it. When real authentication exists, the
 *    ONLY change needed is resolveOwner() below (return the signed-in user's
 *    id) - the models, services and tests already enforce ownership.
 *  - Browser CSRF defence: a state-changing request carrying an Origin that is
 *    not one of CORS_ORIGIN is refused, so a malicious web page cannot make
 *    the user's browser connect/disconnect accounts or approve uploads.
 *    (Non-browser clients send no Origin and are not affected.)
 *  - Rate limits tighter than the global one, because these routes cost
 *    third-party API quota.
 */

const OWNER_ID = 'local';
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/** Who the request acts as. Replace with `req.user.id` when authentication is added. */
function resolveOwner() {
  return OWNER_ID;
}

function publishingGuard(req, res, next) {
  req.publishingOwner = resolveOwner(req);

  if (!SAFE_METHODS.has(req.method)) {
    const origin = req.get('origin');
    if (origin && !config.cors.origins.includes(origin)) {
      return res.status(403).json({ error: 'Cross-origin request refused' });
    }
  }
  return next();
}

const message = { error: 'Too many publishing requests, please slow down' };

const publishingLimiter = rateLimit({
  windowMs: config.publishing.rateLimit.windowMs,
  max: config.publishing.rateLimit.max,
  standardHeaders: true,
  legacyHeaders: false,
  message,
  // Reads (dashboard polling/refresh) are cheap; only throttle what changes state.
  skip: (req) => SAFE_METHODS.has(req.method),
});

// Starting an OAuth flow and receiving its callback: few legitimate uses per hour.
const connectLimiter = rateLimit({
  windowMs: 10 * 60_000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message,
});

module.exports = { publishingGuard, publishingLimiter, connectLimiter, resolveOwner, OWNER_ID };
