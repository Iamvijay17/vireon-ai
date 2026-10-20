const { AppError } = require('../../utils/errors');

/**
 * Errors the GPU scheduler raises itself. All three are *transient by
 * nature* - nothing about the job is wrong, the card or a model server is
 * simply not available right now - so none is marked `permanent`, and
 * pipelineErrors.isPermanent() lets the job-level retry policy back off and
 * try again. `retryAfterMs` says how long a sensible wait is.
 */

/** A model service is down or its circuit breaker is open. */
class GpuServiceUnavailableError extends AppError {
  constructor(service, { retryAfterMs = 0, reason = '' } = {}) {
    const wait = retryAfterMs > 0 ? ` - retrying in ${Math.ceil(retryAfterMs / 1000)}s` : '';
    super(`The ${service} service is unavailable${reason ? ` (${reason})` : ''}${wait}`, 503);
    this.service = service;
    this.retryAfterMs = retryAfterMs;
    this.gpuCode = 'GPU_UNAVAILABLE';
  }
}

/** An identical task (same job, stage and service) is already queued or running. */
class DuplicateGpuTaskError extends AppError {
  constructor(key) {
    super(`An identical GPU task is already queued or running (${key})`, 409);
    this.key = key;
    this.gpuCode = 'GPU_DUPLICATE';
  }
}

/** The GPU never freed up within the admission budget and the caller asked not to proceed. */
class GpuAdmissionTimeoutError extends AppError {
  constructor(service, waitedMs) {
    super(`Timed out after ${Math.round(waitedMs / 1000)}s waiting for GPU memory for ${service}`, 503);
    this.service = service;
    this.gpuCode = 'GPU_BUSY';
  }
}

module.exports = { GpuServiceUnavailableError, DuplicateGpuTaskError, GpuAdmissionTimeoutError };
