/**
 * Where the job is in its pipeline, from the Studio's point of view: which
 * single primary action the toolbar offers and whether scenes are editable.
 * Manual mode (fastGeneration: false) pauses twice more after approval -
 * once with the script approved and waiting for "Generate Audio", once with
 * audio ready and waiting for "Generate Render" - mirroring the course-video
 * pipeline's separate script/audio/render steps.
 */
export function getStudioStage(job) {
  const isAwaitingApproval = job.status === "AWAITING_APPROVAL";
  const isManual = job.fastGeneration === false;
  return {
    isAwaitingApproval,
    isManual,
    isAwaitingAudioTrigger: isManual && job.status === "SCRIPT_COMPLETED",
    isAwaitingRenderTrigger: isManual && job.status === "AUDIO_COMPLETED",
    canEdit: ["COMPLETED", "FAILED", "SCRIPT_COMPLETED", "AUDIO_COMPLETED"].includes(job.status) || isAwaitingApproval,
  };
}
