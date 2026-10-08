const { JOB_STATUS } = require('./index');
const { ValidationError } = require('../utils/errors');

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
  // A finished (successful or failed) render can be redone, and so can a finished job
  // whose scenes were just edited: saving moves it to SCRIPT_COMPLETED "ready for an
  // explicit re-render" (see SceneController.updateScenes), which the Studio's Re-render
  // button offers. The worker's steps are gated on what is stored, not on this status, so
  // missing audio or scene images are still generated before the render.
  rerender: [JOB_STATUS.COMPLETED, JOB_STATUS.FAILED, JOB_STATUS.SCRIPT_COMPLETED],
  // Any state except CANCELLED can regenerate its script from scratch.
  regenerateScript: ALL_STATUSES.filter((s) => s !== JOB_STATUS.CANCELLED),
  // Only a job that's actually still going can be stopped.
  stop: ALL_STATUSES.filter(
    (s) => ![JOB_STATUS.COMPLETED, JOB_STATUS.FAILED, JOB_STATUS.CANCELLED].includes(s)
  ),
  // A script can only be approved while awaiting that exact approval.
  approve: [JOB_STATUS.AWAITING_APPROVAL],
  // Manual-mode only: audio generation requires an approved script. AUDIO_COMPLETED is
  // allowed too so a voice changed after the first take can redo every scene (the
  // lifecycle step clears the old audio and rewinds the job to SCRIPT_COMPLETED).
  generateAudio: [JOB_STATUS.SCRIPT_COMPLETED, JOB_STATUS.AUDIO_COMPLETED],
  // Manual-mode only: rendering requires completed audio.
  generateRender: [JOB_STATUS.AUDIO_COMPLETED],
  // A finished (or failed, or audio-complete manual-mode) job can have one scene's
  // picture re-rolled. Earlier states have no images yet - they get made when the
  // pipeline reaches the image step anyway.
  regenerateImage: [JOB_STATUS.COMPLETED, JOB_STATUS.FAILED, JOB_STATUS.AUDIO_COMPLETED],
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
    throw new ValidationError(describe(job.status));
  }
}

/**
 * Statuses in which a worker is (or should be) actively holding the job. A job
 * sitting in one of these with no live BullMQ job behind it has been orphaned -
 * the restart sweep (startup/recovery.js) and the worker's failure handler both
 * key off this one list.
 */
const IN_FLIGHT_VIDEO_STATUSES = Object.freeze([
  JOB_STATUS.QUEUED,
  JOB_STATUS.SCRIPT_GENERATION,
  JOB_STATUS.GENERATING_AUDIO,
  JOB_STATUS.GENERATING_IMAGES,
  JOB_STATUS.PREPARING_ASSETS,
  JOB_STATUS.RENDERING,
  JOB_STATUS.UPLOADING,
]);

module.exports = { VIDEO_JOB_TRANSITIONS, IN_FLIGHT_VIDEO_STATUSES, assertTransitionAllowed };
