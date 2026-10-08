import { STEP_ORDER, BUSY_STATUSES } from "./constants";

/**
 * Everything the render page shows or hides for a job, derived from its
 * status alone: which toolbar buttons appear, and for each pipeline stage
 * whether its action is available and, when it isn't, the reason shown.
 */
export function deriveJobView(job) {
  const status = job?.status;
  const currentStepIndex = STEP_ORDER.indexOf(status);
  const isComplete = status === "COMPLETED";
  const isFailed = status === "FAILED";
  const isCancelled = status === "CANCELLED";
  const isActive = !isComplete && !isFailed && !isCancelled;
  const hasScript = job?.script?.scenes?.length > 0;
  const showReviewScript = status === "AWAITING_APPROVAL";
  const showGenerateAudio = job?.fastGeneration === false && status === "SCRIPT_COMPLETED";
  const showGenerateRender = job?.fastGeneration === false && status === "AUDIO_COMPLETED";
  // Audio is done but the render hasn't started: the whole narration can still be
  // redone (e.g. after a voice change) before the video is built from it.
  const showRegenerateAudio = showGenerateRender;
  // Every other active state (queued behind script, generating audio/images,
  // preparing assets, rendering, uploading) currently has no way to jump into
  // the Studio - fall back to a plain "Studio" button once a script exists.
  const showGenericStudio = hasScript && isActive && !showReviewScript && !showGenerateAudio && !showGenerateRender;
  // A job stuck in an active state (e.g. UPLOADING forever) has no FAILED
  // status to trigger the restart button - offer manual regeneration for any
  // active, non-queued job so it isn't stuck with no recourse.
  const canRegenerateStuck = isActive && status !== "QUEUED";
  // A cancelled job can still be restarted (backend only blocks COMPLETED).
  const canRestartCancelled = isCancelled;
  // Stoppable at any point before it's actually finished, including QUEUED
  // (removes it from the queue before it ever starts).
  const canStop = isActive;

  const isBusy = BUSY_STATUSES.includes(status);
  const canEditDetails = Boolean(job) && !isBusy;
  const editDisabledReason = isBusy
    ? `Job is actively processing (${status.replace(/_/g, " ").toLowerCase()}) - wait for it to finish or pause.`
    : undefined;

  // Per-stage pipeline actions, always shown (disabled + a reason when not
  // eligible) rather than appearing/disappearing, so the whole flow reads
  // clearly top to bottom - mirrors the course-video pipeline's per-stage
  // buttons.
  const canRegenerateScript = hasScript && !isActive && !isCancelled;
  const scriptStageReason = !hasScript
    ? "The script hasn't been generated yet"
    : !canRegenerateScript
    ? isCancelled
      ? "Job was stopped - use Restart Job instead"
      : "Job is currently active"
    : undefined;

  const approvalStageReason = showReviewScript
    ? undefined
    : !hasScript
    ? "No script to review yet"
    : STEP_ORDER.indexOf(status) > STEP_ORDER.indexOf("AWAITING_APPROVAL")
    ? "Already approved"
    : "Not ready for review yet";

  const audioStageReason = job?.fastGeneration
    ? "Runs automatically after approval (Fast Generation is on)"
    : showGenerateAudio || showRegenerateAudio
    ? undefined
    : STEP_ORDER.indexOf(status) > STEP_ORDER.indexOf("AUDIO_COMPLETED")
    ? "Audio already generated - regenerate individual scenes below"
    : "Approve the script first";

  const canReRenderComplete = isComplete;
  const renderStageReason = job?.fastGeneration
    ? "Runs automatically after approval (Fast Generation is on)"
    : showGenerateRender
    ? undefined
    : canReRenderComplete
    ? undefined
    : "Generate audio first";

  return {
    currentStepIndex,
    isComplete,
    isFailed,
    isCancelled,
    isActive,
    hasScript,
    showReviewScript,
    showGenerateAudio,
    showGenerateRender,
    showRegenerateAudio,
    showGenericStudio,
    canRegenerateStuck,
    canRestartCancelled,
    canStop,
    canEditDetails,
    editDisabledReason,
    canRegenerateScript,
    scriptStageReason,
    approvalStageReason,
    audioStageReason,
    canReRenderComplete,
    renderStageReason,
  };
}
