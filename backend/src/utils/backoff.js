/**
 * Exponential backoff delay for automatic job retries - shared by the video
 * and course-video workers so a failing job doesn't hammer whatever external
 * service just rejected it (LM Studio, TTS, Remotion, storage).
 */
function computeBackoffMs(attempt, { base = 5000, max = 60_000 } = {}) {
  return Math.min(base * 2 ** (attempt - 1), max);
}

module.exports = { computeBackoffMs };
