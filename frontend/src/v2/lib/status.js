/**
 * The single place where this app's many backend status strings collapse
 * into a vocabulary a person can actually learn.
 *
 * The backend has three separate status enums - JOB_STATUS for video jobs,
 * VIDEO_STATUS + STAGE_STATUS for course videos, plus audio generations -
 * and v1 re-derived the mapping on nearly every screen, which is why the
 * same job could read "Processing" in one view and "Rendering" in another.
 * Here it resolves once, to one of five states and one of five pipeline
 * stages.
 */

/** The five states. Every status maps to exactly one. */
export const STATE = {
  IDLE: "idle", // queued, draft - nothing happening yet
  RUN: "run", // actively processing
  WAIT: "wait", // blocked on a person (approval gate)
  DONE: "done", // finished successfully
  FAIL: "fail", // failed or cancelled
};

/** The pipeline, in order. Stage identity is consistent app-wide. */
export const STAGES = [
  { id: "script", label: "Script" },
  { id: "voice", label: "Voice" },
  { id: "avatar", label: "Avatar" },
  { id: "render", label: "Render" },
  { id: "publish", label: "Publish" },
];

// Exact backend status -> state. Matched case-insensitively and with
// separators normalised, so "AUDIO_COMPLETED", "Audio Completed" and
// "audio-completed" all land in the same place.
const STATE_BY_STATUS = {
  // idle
  queued: STATE.IDLE,
  draft: STATE.IDLE,
  pending: STATE.IDLE,
  notstarted: STATE.IDLE,
  // waiting on a human
  awaitingapproval: STATE.WAIT,
  scriptcompleted: STATE.WAIT,
  audiocompleted: STATE.WAIT,
  retryscheduled: STATE.WAIT,
  // running
  scriptgeneration: STATE.RUN,
  generatingscript: STATE.RUN,
  generatingaudio: STATE.RUN,
  generatingavatar: STATE.RUN,
  preparingassets: STATE.RUN,
  rendering: STATE.RUN,
  uploading: STATE.RUN,
  processing: STATE.RUN,
  inprogress: STATE.RUN,
  // terminal
  completed: STATE.DONE,
  complete: STATE.DONE,
  ready: STATE.DONE,
  failed: STATE.FAIL,
  cancelled: STATE.FAIL,
  canceled: STATE.FAIL,
  error: STATE.FAIL,
};

const normalise = (status) =>
  String(status || "")
    .toLowerCase()
    .replace(/[\s_-]/g, "");

/** Resolve any backend status string to one of the five states. */
export function stateOf(status) {
  return STATE_BY_STATUS[normalise(status)] ?? STATE.IDLE;
}

/** Human label for a raw status: "AUDIO_COMPLETED" -> "Audio completed". */
export function labelOf(status) {
  const raw = String(status || "").replace(/[_-]+/g, " ").trim();
  if (!raw) return "Unknown";
  const lower = raw.toLowerCase();
  return lower.charAt(0).toUpperCase() + lower.slice(1);
}

/**
 * Which pipeline stage a status belongs to, or null for statuses that sit
 * outside the pipeline (queued, completed).
 */
export function stageOf(status) {
  const s = normalise(status);
  if (s.includes("script")) return "script";
  if (s.includes("audio") || s.includes("voice")) return "voice";
  if (s.includes("avatar")) return "avatar";
  if (s.includes("render") || s.includes("assets")) return "render";
  if (s.includes("upload") || s.includes("publish")) return "publish";
  return null;
}

/** Is this job doing work right now? Drives live indicators and polling. */
export const isRunning = (status) => stateOf(status) === STATE.RUN;

/** Is this job finished, one way or the other? */
export const isTerminal = (status) => {
  const state = stateOf(status);
  return state === STATE.DONE || state === STATE.FAIL;
};

/** CSS custom property holding this state's colour. */
export const stateColor = (state) => `var(--color-state-${state})`;

/** CSS custom property holding this stage's colour. */
export const stageColor = (stage) => `var(--color-stage-${stage})`;
