// Display helpers for the Control Center. Kept apart from the component so the rules that
// decide what a figure SAYS (and above all what it says when there is no data) are testable.

import { formatDuration } from "./format";

/** A rate (0-100) or "-" when there is nothing behind it. 0 is a real, reportable number. */
export const showRate = (value) => (value === null || value === undefined ? "—" : `${value}%`);

/** A count; never null-like, but "—" for a count that was not measured at all. */
export const showCount = (value) => (value === null || value === undefined ? "—" : value.toLocaleString());

/** A duration in ms, or "-" for "no data" (null) - and "0s" only for a measured zero. */
export const showDuration = (ms) => (ms === null || ms === undefined ? "—" : formatDuration(ms));

/**
 * One sentence about jobs that predate per-stage tracking, or null when there is nothing to say.
 * They are counted but left out of the stage averages - so the page must not look like the
 * averages cover them.
 */
export const stageCoverageNote = (pipeline) => {
  const without = pipeline?.jobsWithoutStageData || 0;
  const withData = pipeline?.jobsWithStageData || 0;
  if (without === 0) return null;
  if (withData === 0) {
    return `Stage timing is recorded for jobs run from now on. ${without} earlier job${without === 1 ? "" : "s"} predate it, so there are no stage averages yet.`;
  }
  return `Stage averages cover ${withData} job${withData === 1 ? "" : "s"}; ${without} earlier job${without === 1 ? "" : "s"} predate stage tracking and are not included.`;
};

/** Cache kinds as a person would name them. */
const KIND_LABELS = {
  image: "Images",
  tts: "Voice (whole scene)",
  "tts-seg-raw": "Voice clips (raw)",
  "tts-seg-processed": "Voice clips (processed)",
  transcript: "Voice transcripts",
  render: "Final render",
};
export const kindLabel = (kind) => KIND_LABELS[kind] || kind;

/** The status of a worker queue for display: online / offline / unavailable. */
export const queueState = (queue) => {
  if (!queue || queue.available === false) return { label: "Unavailable", tone: "danger" };
  if (queue.workersOnline === 0) return { label: "No worker online", tone: "warning" };
  if (queue.active > 0) return { label: "Working", tone: "success" };
  return { label: "Idle", tone: "neutral" };
};
