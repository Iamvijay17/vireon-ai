const PROCESSING_STATUSES = ["Generating Script", "Generating Audio", "Rendering Video", "Uploading", "Generating Scenes", "Generating Images"];

const plural = (n) => `${n} scene${n === 1 ? "" : "s"}`;

/**
 * What the lesson page shows for a video: its status flags, the state of
 * each of the three step cards (done / active / locked / error), a one-line
 * summary per card, and which card to open when the user hasn't picked one.
 */
export function deriveLessonView(video) {
  const isProcessing = PROCESSING_STATUSES.includes(video?.status);
  const isUploading = video?.status === "Uploading";
  const isFailed = video?.status === "Failed";
  const isCompleted = video?.status === "Completed";
  const hasScript = Boolean(video?.script?.scenes?.length);
  const isApproved = video?.approved;
  const hasAudio = video?.audioUrl && video.audioUrl.length > 0;
  const scenes = video?.script?.scenes || [];

  const failedStep = (video?.error?.step || "").toLowerCase();
  const scriptState = isFailed && failedStep.includes("script") ? "error" : isApproved ? "done" : "active";
  const audioState = isFailed && failedStep.includes("audio")
    ? "error"
    : hasAudio
    ? "done"
    : isApproved
    ? "active"
    : "locked";
  const renderState = isFailed && (failedStep.includes("render") || failedStep.includes("upload"))
    ? "error"
    : isCompleted
    ? "done"
    : hasAudio
    ? "active"
    : "locked";

  // Auto-follow the pipeline: open whichever step isn't done yet.
  const autoOpenStep = scriptState !== "done" ? "script" : audioState !== "done" ? "audio" : "render";

  const scriptSummary = scriptState === "done"
    ? `${plural(scenes.length)} • Approved`
    : hasScript
    ? `${plural(scenes.length)} • Awaiting approval`
    : "Not generated yet";
  const audioSummary = audioState === "done"
    ? `${Math.round(video.audioDuration)}s narration • Generated`
    : audioState === "locked"
    ? "Waiting on script approval"
    : "Not generated yet";
  const renderSummary = renderState === "done"
    ? `Completed ${video.renderedAt ? new Date(video.renderedAt).toLocaleDateString() : ""}`
    : renderState === "locked"
    ? "Waiting on audio"
    : "Ready to render";

  return {
    isProcessing,
    isUploading,
    isFailed,
    isCompleted,
    hasScript,
    isApproved,
    hasAudio,
    scenes,
    scriptState,
    audioState,
    renderState,
    autoOpenStep,
    scriptSummary,
    audioSummary,
    renderSummary,
  };
}
