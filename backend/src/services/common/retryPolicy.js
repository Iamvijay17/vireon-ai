const { computeBackoffMs } = require('../../utils/backoff');

/**
 * The automatic-retry policy, shared by the video worker and the course
 * video worker.
 *
 * Both pipelines had their own copy of the same four decisions - is this
 * attempt within budget, how long to wait, what to tell the activity log,
 * and what BullMQ job id to enqueue under - written slightly differently in
 * each place. The *persistence* around them genuinely differs (VideoJob vs
 * CourseVideo have different schemas and different scheduleRetry calls), so
 * that stays where it is; only the policy is unified here.
 *
 * Deliberately pure: no DB, no queue, no logging. That is what makes the
 * retry budget testable without standing up Mongo and Redis.
 */

const DEFAULT_MAX_RETRIES = 3;

/**
 * Decide whether a failed attempt should be retried, and when.
 *
 * `attempt` is 1-based and means "the attempt that just failed" - so
 * attempt 1 with maxRetries 3 still has budget. Callers that store an
 * already-incremented counter pass it straight through; callers that store
 * "how many retries have happened" pass `retryCount + 1`.
 *
 * `eligible` is the caller's own veto (e.g. the course worker's rule that a
 * manual `retry` action must not itself kick off another automatic retry
 * loop). Kept as a parameter rather than inferred here because what makes
 * an attempt ineligible is pipeline-specific, while the budget is not.
 */
function decideRetry({ attempt, maxRetries = DEFAULT_MAX_RETRIES, eligible = true } = {}) {
  const withinBudget = Number.isInteger(attempt) && attempt > 0 && attempt <= maxRetries;

  if (!eligible || !withinBudget) {
    return { shouldRetry: false, attempt, maxRetries };
  }

  const delayMs = computeBackoffMs(attempt);
  return {
    shouldRetry: true,
    attempt,
    maxRetries,
    delayMs,
    nextRetryAt: new Date(Date.now() + delayMs),
  };
}

/**
 * The activity-log line a scheduled retry writes. One wording for both
 * pipelines, so the Job Management view reads consistently regardless of
 * which worker produced the entry.
 */
function describeRetry({ step, attempt, maxRetries, delayMs, reason }) {
  const cause = reason ? `: ${reason}` : '';
  return `${step} failed (attempt ${attempt}/${maxRetries})${cause} - retrying in ${Math.round(delayMs / 1000)}s`;
}

/** The line written when the retry budget is gone and the job is terminally failed. */
function describeExhausted({ step, attempt, reason }) {
  const cause = reason ? `: ${reason}` : '';
  return `${step} failed after ${attempt} attempts${cause}`;
}

/**
 * BullMQ job id for a scheduled retry.
 *
 * Must differ from the entity's own id: the attempt that just failed is
 * still finishing under that id, and reusing it makes BullMQ drop the new
 * job as a duplicate - which presents as a retry that was "scheduled" and
 * then never ran.
 */
function retryJobId(entityId, attempt) {
  return `${entityId}:retry:${attempt}`;
}

module.exports = { decideRetry, describeRetry, describeExhausted, retryJobId, DEFAULT_MAX_RETRIES };
