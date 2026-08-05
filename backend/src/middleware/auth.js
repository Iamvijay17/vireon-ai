/**
 * Auth middleware (pass-through).
 * No authentication required - single-user system, intended for
 * localhost/LAN use only. There is no user/session/JWT scaffolding
 * anywhere else in the backend to wire this up to - if this app is ever
 * exposed beyond a trusted network, real authentication needs to be built
 * from scratch (user model, login flow, token issuance/verification), not
 * just un-stubbed here.
 */

const authenticate = (req, res, next) => {
  next();
};

const optionalAuth = (req, res, next) => {
  next();
};

const requireAdmin = (req, res, next) => {
  next();
};

module.exports = { authenticate, optionalAuth, requireAdmin };
