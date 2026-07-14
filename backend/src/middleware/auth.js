const jwt = require('jsonwebtoken');
const config = require('../config');
const User = require('../models/User');
const LoggerService = require('../services/LoggerService');

/**
 * JWT Authentication middleware.
 * Extracts and verifies Bearer token from Authorization header.
 */
const authenticate = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, config.jwt.secret);

    const user = await User.findById(decoded.id);
    if (!user) {
      return res.status(401).json({ error: 'User not found' });
    }

    req.user = user;
    next();
  } catch (err) {
    LoggerService.warn('Authentication failed', { error: err.message });
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
};

/**
 * Optional auth - attaches user if token present, but doesn't block.
 */
const optionalAuth = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.split(' ')[1];
      const decoded = jwt.verify(token, config.jwt.secret);
      req.user = await User.findById(decoded.id);
    }
  } catch {
    // Silently ignore - user stays undefined
  }
  next();
};

/**
 * Admin role check - must be used after authenticate.
 */
const requireAdmin = (req, res, next) => {
  if (!req.user || req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Admin access required' });
  }
  next();
};

module.exports = { authenticate, optionalAuth, requireAdmin };
