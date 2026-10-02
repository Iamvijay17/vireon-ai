/**
 * Typed application errors. `errorHandler.js`'s fallback branch already
 * accepts anything with a `.status`/`.message` - these classes don't change
 * that contract, they replace the plain `throw { status, message }` object
 * literals used throughout the services/controllers with real `Error`
 * instances that carry an actual stack trace (a plain object throw has
 * none, so `config.isDev`'s stack-trace logging silently had nothing to
 * show for the single most common error shape in this codebase).
 *
 * `instanceof AppError` also gives later code (e.g. a retry policy that
 * should only auto-retry a transient RenderError, never a ValidationError)
 * a real type to branch on instead of guessing from a status code or a
 * message string.
 */
class AppError extends Error {
  constructor(message, status = 500) {
    super(message);
    this.name = this.constructor.name;
    this.status = status;
    Error.captureStackTrace?.(this, this.constructor);
  }
}

/** 404 - the requested record doesn't exist. */
class NotFoundError extends AppError {
  constructor(message = 'Not found') {
    super(message, 404);
  }
}

/** 400 - the request itself is invalid (bad input, or not allowed given current state). */
class ValidationError extends AppError {
  constructor(message = 'Invalid request') {
    super(message, 400);
  }
}

/** 409 - the request conflicts with the record's current state. */
class ConflictError extends AppError {
  constructor(message = 'Conflict') {
    super(message, 409);
  }
}

/**
 * 400 - a request rejected by a zod schema, carrying the per-field issues
 * the UI renders next to each input.
 *
 * Distinct from ValidationError because it has a `details` payload:
 * errorHandler used to detect this shape structurally (`err.status &&
 * err.errors`), which matched any error that happened to have both
 * properties. A real type makes the branch exact.
 */
class SchemaValidationError extends AppError {
  constructor(details, message = 'Validation failed') {
    super(message, 400);
    this.details = details;
  }
}

/** 500 - a pipeline/render step failed for a reason worth distinguishing from a generic 500. */
class RenderError extends AppError {
  constructor(message = 'Render failed') {
    super(message, 500);
  }
}

module.exports = { AppError, NotFoundError, ValidationError, ConflictError, SchemaValidationError, RenderError };
