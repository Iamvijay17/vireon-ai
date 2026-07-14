/**
 * Auth middleware (pass-through).
 * No authentication required - single-user system.
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
