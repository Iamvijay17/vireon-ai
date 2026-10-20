import { classifyStatus } from "./statusTone";

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

const QUEUED_STATUSES = new Set(["QUEUED", "RETRY_SCHEDULED"]);
// Paused between stages: the user has to approve or trigger the next step
// (manual mode), or the worker is about to pick the job up again. Either way
// nothing is executing right now, so it must not read as "running".
const WAITING_STATUSES = new Set(["AWAITING_APPROVAL", "SCRIPT_COMPLETED", "AUDIO_COMPLETED", "IMAGE_COMPLETED"]);

/**
 * Where a video job really is, in the words the UI uses everywhere:
 * running | queued | waiting | completed | failed | cancelled.
 *
 * Job statuses are exact tokens, so this does not keyword-match the way
 * statusTone.classifyStatus does for the mixed course/audio vocabularies
 * (which reads AUDIO_COMPLETED as "success"). Anything unrecognised falls
 * back to that classifier so course and audio-studio rows still resolve.
 */
export function jobPhase(status) {
  const s = String(status || "").toUpperCase();
  if (RUNNING_JOB_STATUSES.has(s)) return "running";
  if (QUEUED_STATUSES.has(s)) return "queued";
  if (WAITING_STATUSES.has(s)) return "waiting";
  if (s === "COMPLETED") return "completed";
  if (s === "FAILED") return "failed";
  if (s === "CANCELLED" || s === "ARCHIVED") return "cancelled";
  switch (classifyStatus(status)) {
    case "success":
      return "completed";
    case "error":
      return "failed";
    case "cancelled":
      return "cancelled";
    case "processing":
      return "running";
    default:
      return "queued";
  }
}

/** Jobs the system still owes work on (running, queued or waiting on a person). */
export const isJobOpen = (status) => !["completed", "failed", "cancelled"].includes(jobPhase(status));

/**
 * A running job whose record has not changed for a long time. The worker
 * touches updatedAt on every progress write, so silence while "running" means
 * the worker died or the socket feed was lost - worth saying out loud rather
 * than leaving a bar frozen at some percentage.
 */
export const STALE_AFTER_MS = 10 * 60 * 1000;

export function staleForMs(job, now = Date.now()) {
  if (!job || jobPhase(job.status) !== "running") return null;
  const updated = new Date(job.updatedAt || job.createdAt).getTime();
  if (!Number.isFinite(updated)) return null;
  const silent = now - updated;
  return silent > STALE_AFTER_MS ? silent : null;
}
