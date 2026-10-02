import { BUSY_STATUSES } from "./constants";

export const isVideoBusy = (video) => BUSY_STATUSES.includes(video.status);
export const videoHasApprovedScript = (video) => Boolean(video.approved);
export const videoHasAudio = (video) => Boolean(video.audioUrl);
export const videoCanApprove = (video) => ["Script Generated", "Waiting for Approval"].includes(video.status) && !video.approved;

export const stageActionLabel = (stageLabel, status) => {
  if (status === "Failed") return `Retry ${stageLabel}`;
  if (status === "Completed") return `Regenerate ${stageLabel}`;
  return `Generate ${stageLabel}`;
};

// Per-video eligibility for each pipeline action, mirroring the same
// prerequisites CourseVideoService enforces server-side (approveScript,
// generateAudio, renderVideo, prepareBulkJobs) so the buttons never invite a
// request the backend will just reject. `reason` is a function (not a fixed
// string) so a busy video shows "already processing" rather than a stale
// prerequisite message that no longer matches why the button is disabled.
export const ACTION_GATES = {
  "generate-script": {
    eligible: (v) => !isVideoBusy(v),
    reason: () => "This lesson is already processing",
  },
  "generate-audio": {
    eligible: (v) => !isVideoBusy(v) && videoHasApprovedScript(v),
    reason: (v) => (isVideoBusy(v) ? "This lesson is already processing" : "Approve the script before generating audio"),
  },
  render: {
    eligible: (v) => !isVideoBusy(v) && videoHasAudio(v),
    reason: (v) => (isVideoBusy(v) ? "This lesson is already processing" : "Generate audio before rendering the video"),
  },
  "generate-full": {
    eligible: (v) => !isVideoBusy(v),
    reason: () => "This lesson is already processing",
  },
};
