/**
 * Failure taxonomy for narration segments. Each segment stores one of these
 * codes (plus a user-safe message) instead of a raw exception, so the UI can
 * say "the voice model was unavailable" without ever showing a stack trace,
 * and so a retry can decide whether trying again is worthwhile.
 */
const SEGMENT_ERROR_CODES = Object.freeze({
  MODEL_UNAVAILABLE: 'MODEL_UNAVAILABLE',
  GPU_OOM: 'GPU_OOM',
  TIMEOUT: 'TIMEOUT',
  INVALID_INPUT: 'INVALID_INPUT',
  PROCESSING_FAILED: 'PROCESSING_FAILED',
  CACHE_FAILED: 'CACHE_FAILED',
  CANCELLED: 'CANCELLED',
  UNKNOWN: 'UNKNOWN',
});

const USER_MESSAGES = Object.freeze({
  MODEL_UNAVAILABLE: 'The voice model was not available. Check that the TTS service is running, then retry.',
  GPU_OOM: 'The GPU ran out of memory while generating this line. Close other GPU apps and retry.',
  TIMEOUT: 'Generating this line took too long. Retry, or shorten the text.',
  INVALID_INPUT: 'This line could not be sent to the voice model because of invalid text or settings.',
  PROCESSING_FAILED: 'The audio was generated but post-processing failed.',
  CACHE_FAILED: 'The audio cache could not be read or written.',
  CANCELLED: 'Generation was cancelled.',
  UNKNOWN: 'Voice generation failed for this line. Retry it, and check the logs if it keeps failing.',
});

// Codes worth retrying automatically / by hand. INVALID_INPUT and CANCELLED
// will fail identically however many times they are re-run.
const RETRYABLE = new Set([
  SEGMENT_ERROR_CODES.MODEL_UNAVAILABLE,
  SEGMENT_ERROR_CODES.GPU_OOM,
  SEGMENT_ERROR_CODES.TIMEOUT,
  SEGMENT_ERROR_CODES.PROCESSING_FAILED,
  SEGMENT_ERROR_CODES.CACHE_FAILED,
  SEGMENT_ERROR_CODES.UNKNOWN,
]);

/** An error that already knows its segment error code. */
class SegmentError extends Error {
  constructor(code, message, { cause } = {}) {
    super(message || USER_MESSAGES[code] || code);
    this.name = 'SegmentError';
    this.code = code;
    if (cause) this.cause = cause;
  }
}

/**
 * Map any thrown value onto a SEGMENT_ERROR_CODES entry. Patterns match the
 * message shapes thrown by ttsClient/withTimeout/ttsManager/ffmpeg.js.
 */
function classifySegmentError(err) {
  if (err instanceof SegmentError) return err.code;
  if (err?.name === 'AbortError') return SEGMENT_ERROR_CODES.CANCELLED;

  const msg = String(err?.message || err || '').toLowerCase();

  if (/out of memory|cuda error|cuda out|cublas|oom\b/.test(msg)) return SEGMENT_ERROR_CODES.GPU_OOM;
  if (/timed out|timeout|etimedout/.test(msg)) return SEGMENT_ERROR_CODES.TIMEOUT;
  if (/econnrefused|econnreset|enotfound|not running|failed to start|failed to become ready|connecting to tts|tts_start_command/.test(msg)) {
    return SEGMENT_ERROR_CODES.MODEL_UNAVAILABLE;
  }
  if (/invalid clone voice|clone voice file not found|voice design requires|invalid input|validation/.test(msg)) {
    return SEGMENT_ERROR_CODES.INVALID_INPUT;
  }
  if (/ffmpeg|ffprobe|audio processing|not a valid wav/.test(msg)) return SEGMENT_ERROR_CODES.PROCESSING_FAILED;
  if (/smart cache|cache/.test(msg)) return SEGMENT_ERROR_CODES.CACHE_FAILED;
  return SEGMENT_ERROR_CODES.UNKNOWN;
}

/** `{ code, message, retryable }` safe to persist and show to a user. */
function toSegmentError(err) {
  const code = classifySegmentError(err);
  return { code, message: USER_MESSAGES[code], retryable: RETRYABLE.has(code) };
}

module.exports = { SEGMENT_ERROR_CODES, SegmentError, classifySegmentError, toSegmentError, USER_MESSAGES };
