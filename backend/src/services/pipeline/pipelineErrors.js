const { classifyError } = require('../../utils/errorMessages');
const { AppError, ValidationError, SchemaValidationError } = require('../../utils/errors');
const { STAGES } = require('./stages');

/**
 * Raised when a stage outlives its time budget (see stageRunner). Retryable: a
 * hung Ollama/ComfyUI/Remotion call is exactly the kind of thing a second
 * attempt clears.
 */
class StageTimeoutError extends AppError {
  constructor(stage, timeoutMs) {
    super(`Stage "${stage}" timed out after ${Math.round(timeoutMs / 1000)}s`, 504);
    this.stage = stage;
    this.timeoutMs = timeoutMs;
  }
}

/**
 * The job was reclaimed after its worker died (BullMQ stalled-job limit, or a
 * restart sweep). Always retryable: nothing about the job itself was wrong.
 */
class JobStalledError extends AppError {
  constructor(message = 'Job was interrupted when its worker stopped responding') {
    super(message, 500);
  }
}

const CODES = Object.freeze({
  STAGE_TIMEOUT: 'STAGE_TIMEOUT',
  JOB_STALLED: 'JOB_STALLED',
  VALIDATION_FAILED: 'VALIDATION_FAILED',
  CONFIG_INVALID: 'CONFIG_INVALID',
  DISK_FULL: 'DISK_FULL',
  NETWORK_ERROR: 'NETWORK_ERROR',
  SCRIPT_FAILED: 'SCRIPT_FAILED',
  TTS_FAILED: 'TTS_FAILED',
  IMAGE_FAILED: 'IMAGE_FAILED',
  ASSETS_FAILED: 'ASSETS_FAILED',
  RENDER_FAILED: 'RENDER_FAILED',
  UPLOAD_FAILED: 'UPLOAD_FAILED',
  UNKNOWN: 'UNKNOWN',
});

const STAGE_CODE = Object.freeze({
  [STAGES.SCRIPT]: CODES.SCRIPT_FAILED,
  [STAGES.AUDIO]: CODES.TTS_FAILED,
  [STAGES.IMAGES]: CODES.IMAGE_FAILED,
  [STAGES.ASSETS]: CODES.ASSETS_FAILED,
  [STAGES.RENDER]: CODES.RENDER_FAILED,
  [STAGES.UPLOAD]: CODES.UPLOAD_FAILED,
});

const NETWORK_ERRNO = new Set(['ECONNREFUSED', 'ECONNRESET', 'ETIMEDOUT', 'ENOTFOUND', 'EAI_AGAIN', 'EPIPE']);

// Failures a second attempt cannot change: the input or the setup is wrong, not
// the moment. Messages are matched because most of these are plain Errors thrown
// deep in a service (the repo's own wording - see remotionAssetChecks.js,
// sceneGraphCheck.js, ImageGenerationService's configError).
const PERMANENT_MESSAGE = [
  /pre-render validation failed/i,
  /scenegraph compile failed/i,
  /is not set\b/i,
  /not valid json/i,
  /workflow not found/i,
  /remotion cli not found/i,
];

/**
 * Strip anything that looks like a stack frame. Error messages occasionally
 * embed one (a wrapped child-process failure, a re-thrown remote error), and a
 * trace is internal detail that must not reach the UI.
 */
function sanitizeMessage(message, max = 500) {
  const text = String(message ?? '')
    .split('\n')
    .filter((line) => !/^\s+at\s+\S/.test(line))
    .join('\n')
    .trim();
  return text.length > max ? `${text.slice(0, max - 3)}...` : text;
}

function isPermanent(err) {
  if (err?.permanent === true) return true;
  if (err instanceof ValidationError || err instanceof SchemaValidationError) return true;
  if (err?.name === 'ZodError') return true;
  if (err?.code === 'ENOSPC') return true;
  return PERMANENT_MESSAGE.some((re) => re.test(String(err?.message || '')));
}

function codeFor(err, stage) {
  if (err instanceof StageTimeoutError) return CODES.STAGE_TIMEOUT;
  if (err instanceof JobStalledError) return CODES.JOB_STALLED;
  if (err?.code === 'ENOSPC') return CODES.DISK_FULL;
  if (err?.permanent === true) return CODES.CONFIG_INVALID;
  if (isPermanent(err)) return CODES.VALIDATION_FAILED;
  if (NETWORK_ERRNO.has(err?.code) || /econnrefused|enotfound|etimedout|econnreset/i.test(String(err?.message || ''))) {
    return CODES.NETWORK_ERROR;
  }
  return STAGE_CODE[stage] || CODES.UNKNOWN;
}

/**
 * Turn anything a stage threw into the one error shape the job stores, emits and
 * the UI renders:
 *
 *   { code, stage, message, retryable, attempt, timestamp }
 *
 * `message` is the user-facing sentence (never a stack trace). `detail` - the
 * original, sanitized error text - rides alongside for the support log and is
 * what VideoJob.error.detail keeps; it is not part of the structured contract.
 */
function toStructuredError(err, { stage, attempt = 1, step } = {}) {
  const { friendly, detail } = classifyError(err, step || stage);
  const retryable = !isPermanent(err);
  return {
    code: codeFor(err, stage),
    stage: stage || null,
    message: sanitizeMessage(friendly),
    retryable,
    attempt,
    timestamp: new Date().toISOString(),
    detail: sanitizeMessage(detail, 1000),
  };
}

/** The contract subset - what a stage record and the API expose. */
const publicError = (e) => (e ? { code: e.code, stage: e.stage, message: e.message, retryable: e.retryable, attempt: e.attempt, timestamp: e.timestamp } : null);

module.exports = {
  StageTimeoutError,
  JobStalledError,
  CODES,
  toStructuredError,
  sanitizeMessage,
  isPermanent,
  publicError,
};
