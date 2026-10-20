import { isJobRunning } from "../../lib/jobStatus";

const FINISHED = new Set(["COMPLETED", "FAILED", "CANCELLED"]);

/**
 * What the Create Video preview panel should show for a job, from the job as the API returns it.
 *
 *   failed    the job failed or was cancelled before a script existed (nothing to preview)
 *   waiting   no scenes yet - the script is still being written
 *   draft     scenes exist: they can be played in the browser (this is NOT the rendered video)
 *
 * `finalReady` is separate: a finished, quality-checked MP4 exists, so the render page is the
 * place to watch it, not this draft.
 */
export function previewState(job) {
  if (!job) return { kind: "waiting", scenes: [], finalReady: false };
  const scenes = job.script?.scenes || [];
  const finalReady = job.status === "COMPLETED" && Boolean(job.videoUrl);
  if (scenes.length > 0) return { kind: "draft", scenes, finalReady };
  if (job.status === "FAILED" || job.status === "CANCELLED") return { kind: "failed", scenes: [], finalReady: false };
  return { kind: "waiting", scenes: [], finalReady: false };
}

/** Poll while the script may still appear; stop once it exists or the job is over. */
export function previewPollInterval(job) {
  if (!job) return 4000;
  if ((job.script?.scenes || []).length > 0) return false;
  if (FINISHED.has(job.status)) return false;
  return isJobRunning(job.status) || job.status === "QUEUED" || job.status === "RETRY_SCHEDULED" ? 4000 : false;
}
