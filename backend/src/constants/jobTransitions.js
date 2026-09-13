const { JOB_STATUS } = require('./index');

const ALL_STATUSES = Object.values(JOB_STATUS);

/**
 * Declarative source-state allow-lists for VideoJob's user/worker-triggered
 * lifecycle actions (see services/video/videoService/lifecycle.js) - the
 * state machine backing what used to be seven separate inline
 * `if (!allowedStates.includes(job.status))` checks. Centralized here so
 * the full set of legal transitions is visible in one place, and adding a
 * new status to JOB_STATUS can't silently slip past an action that should
 * have rejected it (every action here is defined by exclusion or an
 * explicit allow-list against the *current* full status set, not a stale
 * copy of it).
 */
const VIDEO_JOB_TRANSITIONS = Object.freeze({
  // Only a finished (successful or failed) render can be redone.
  rerender: [JOB_STATUS.COMPLETED, JOB_STATUS.FAILED],
  // Any state except CANCELLED can regenerate its script from scratch.
  regenerateScript: ALL_STATUSES.filter((s) => s !== JOB_STATUS.CANCELLED),
  // Only a job that's actually still going can be stopped.
  stop: ALL_STATUSES.filter(
    (s) => ![JOB_STATUS.COMPLETED, JOB_STATUS.FAILED, JOB_STATUS.CANCELLED].includes(s)
  ),
  // A script can only be approved while awaiting that exact approval.
  approve: [JOB_STATUS.AWAITING_APPROVAL],
  // Manual-mode only: audio generation requires an approved script.
  generateAudio: [JOB_STATUS.SCRIPT_COMPLETED],
  // Manual-mode only: rendering requires completed audio.
  generateRender: [JOB_STATUS.AUDIO_COMPLETED],
  // Anything short of a full success can be restarted/resumed.
  restart: ALL_STATUSES.filter((s) => s !== JOB_STATUS.COMPLETED),
});

/**
 * Throws the standard { status: 400, message } shape lifecycle.js's
 * controllers already expect when `job.status` isn't in the given action's
 * allow-list. `describe(status)` builds the message from the job's current
 * status, matching each action's existing wording.
 */
function assertTransitionAllowed(job, action, describe) {
  const allowed = VIDEO_JOB_TRANSITIONS[action];
  if (!allowed) {
    throw new Error(`Unknown video job transition "${action}"`);
  }
  if (!allowed.includes(job.status)) {
    throw { status: 400, message: describe(job.status) };
  }
}

module.exports = { VIDEO_JOB_TRANSITIONS, assertTransitionAllowed };
