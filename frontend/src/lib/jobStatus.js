// Video-job statuses during which the worker is actually executing a step.
// Mirrors the "actively processing" set the backend itself uses when it reaps
// jobs after a restart (backend/src/server.js STUCK_VIDEO_STATUSES), minus
// QUEUED: a queued job is waiting, not progressing.
//
// Everything else that isn't finished is WAITING, not working: AWAITING_APPROVAL
// (needs the user), AUDIO_COMPLETED (between stages), RETRY_SCHEDULED, QUEUED.
// A progress bar must not creep forward for those - it would claim activity
// that isn't happening.
export const RUNNING_JOB_STATUSES = new Set([
  "SCRIPT_GENERATION",
  "GENERATING_AUDIO",
  "GENERATING_IMAGES",
  "PREPARING_ASSETS",
  "RENDERING",
  "UPLOADING",
]);

export const isJobRunning = (status) => RUNNING_JOB_STATUSES.has(String(status || "").toUpperCase());
