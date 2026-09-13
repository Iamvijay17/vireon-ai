const LoggerService = require('../services/common/LoggerService');
const config = require('../config');
const { AppError } = require('../utils/errors');

/**
 * Global error handling middleware.
 * Catches all errors and returns structured JSON responses.
 */
const errorHandler = (err, req, res, _next) => {
  // A typed AppError (NotFoundError, ValidationError, ...) is an expected,
  // already-classified failure - not the "something we didn't anticipate"
  // case the final fallback's "Unhandled error" log/stack trace is for.
  if (err instanceof AppError) {
    return res.status(err.status).json({ error: err.message });
  }


  // Zod validation errors thrown from validators
  if (err.status && err.errors) {
    return res.status(err.status).json({
      error: 'Validation failed',
      details: err.errors,
    });
  }

  // Mongoose validation error
  if (err.name === 'ValidationError') {
    const errors = Object.values(err.errors).map((e) => ({
      field: e.path,
      message: e.message,
    }));
    return res.status(400).json({ error: 'Validation failed', details: errors });
  }

  // Mongoose duplicate key
  if (err.code === 11000) {
    const field = Object.keys(err.keyValue)[0];
    return res.status(409).json({
      error: 'Duplicate value',
      details: [{ field, message: `${field} already exists` }],
    });
  }

  // Mongoose cast error (invalid ObjectId)
  if (err.name === 'CastError') {
    return res.status(400).json({ error: 'Invalid ID format' });
  }

  // JWT errors
  if (err.name === 'JsonWebTokenError') {
    return res.status(401).json({ error: 'Invalid token' });
  }
  if (err.name === 'TokenExpiredError') {
    return res.status(401).json({ error: 'Token expired' });
  }

  // Multer errors
  if (err.code === 'LIMIT_FILE_SIZE') {
    return res.status(400).json({ error: 'File too large' });
  }
  if (err.code === 'LIMIT_UNEXPECTED_FILE') {
    return res.status(400).json({ error: 'Unexpected file field' });
  }

  LoggerService.error('Unhandled error', {
    message: err.message,
    stack: config.isDev ? err.stack : undefined,
    method: req.method,
    url: req.originalUrl,
  });

  res.status(err.status || 500).json({
    error: err.message || 'Internal server error',
    ...(config.isDev && { stack: err.stack }),
  });
};

module.exports = errorHandler;
