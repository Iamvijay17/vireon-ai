import { isJobRunning } from "../../lib/jobStatus";

export const TERMINAL = new Set(["COMPLETED", "FAILED", "CANCELLED"]);
// Unfinished but blocked on a person, not on the worker: these are not "in the
// queue" in the sense of waiting for their turn.
const NEEDS_PERSON = new Set(["SCRIPT_COMPLETED", "AWAITING_APPROVAL"]);

const upper = (status) => String(status || "").toUpperCase();

/** Short present-tense phrase for what a running job is doing. */
export const STAGE_PHRASE = {
  SCRIPT_GENERATION: "writing the script",
  GENERATING_AUDIO: "generating narration",
  GENERATING_IMAGES: "generating scene images",
  PREPARING_ASSETS: "preparing assets",
  RENDERING: "rendering",
  UPLOADING: "uploading",
};

const byAge = (a, b) => new Date(a.createdAt) - new Date(b.createdAt);

/**
 * Splits the job list into what the worker is doing now, what is waiting its
 * turn, and what is waiting on a person.
 *
 * `waiting` is ordered oldest first. That is an approximation of the worker's
 * real order (retries and manual restarts can jump ahead), which the API does
 * not expose; callers should present it as "up next", not as an exact slot.
 */
export function buildQueue(jobs) {
  const active = (jobs || []).filter((job) => !TERMINAL.has(upper(job.status)));
  const running = active.filter((job) => isJobRunning(job.status)).sort(byAge);
  const approval = active.filter((job) => NEEDS_PERSON.has(upper(job.status))).sort(byAge);
  const waiting = active
    .filter((job) => !isJobRunning(job.status) && !NEEDS_PERSON.has(upper(job.status)))
    .sort(byAge);
  return { running, waiting, approval };
}

/** True once a job can no longer change (finished, failed or cancelled). */
export const isTerminal = (job) => TERMINAL.has(upper(job.status));

/** Why a not-yet-running job is not running, in plain words. */
export function waitReason(job, running) {
  const status = upper(job.status);
  if (status === "RETRY_SCHEDULED") return "Retry scheduled";
  if (status === "AUDIO_COMPLETED" || status === "IMAGE_COMPLETED") return "Between stages";
  const ahead = running?.[0];
  if (ahead) {
    const phrase = STAGE_PHRASE[upper(ahead.status)] || "working";
    return `Waiting for the worker - "${ahead.title || ahead.id}" is ${phrase}`;
  }
  return "Waiting for the worker";
}
