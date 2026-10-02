import { STATE } from "./status";

/**
 * Derive per-stage state from a video job record.
 *
 * Kept next to the component because it encodes the same mental model: a
 * stage is done once its artifact exists, running if the job's status names
 * it, and failed only on the stage that actually failed.
 */
export function stagesFromJob(job) {
  if (!job) return {};

  const scenes = job.script?.scenes || [];
  const withAudio = scenes.filter((s) => s.audio?.file).length;
  const status = String(job.status || "").toUpperCase();

  // `error.step` is authoritative about *where* things broke, and it stays
  // on the record while a retry is scheduled. Keying off status alone meant
  // a RETRY_SCHEDULED job rendered its failed stage as untouched - the
  // screen said "nothing happened here" about the exact step that failed.
  const failedStage = status !== "COMPLETED" && job.error?.step
    ? stageFromStatus(job.error.step)
    : status === "FAILED" || status === "CANCELLED"
      ? stageFromStatus(status)
      : null;

  const at = (id) => (failedStage === id ? STATE.FAIL : null);

  return {
    script:
      at("script") ??
      (scenes.length > 0
        ? STATE.DONE
        : status.includes("SCRIPT")
          ? STATE.RUN
          : STATE.IDLE),

    voice:
      at("voice") ??
      (scenes.length > 0 && withAudio === scenes.length
        ? STATE.DONE
        : status.includes("AUDIO")
          ? withAudio > 0
            ? STATE.RUN
            : STATE.RUN
          : STATE.IDLE),

    avatar:
      at("avatar") ??
      (!job.avatarEnabled
        ? STATE.IDLE
        : job.avatarVideoUrl
          ? STATE.DONE
          : status.includes("AVATAR")
            ? STATE.RUN
            : STATE.IDLE),

    render:
      at("render") ??
      (job.videoUrl
        ? STATE.DONE
        : status.includes("RENDER") || status.includes("ASSETS")
          ? STATE.RUN
          : status === "AUDIO_COMPLETED"
            ? STATE.WAIT
            : STATE.IDLE),

    publish:
      at("publish") ??
      (status === "COMPLETED"
        ? STATE.DONE
        : status.includes("UPLOAD")
          ? STATE.RUN
          : STATE.IDLE),
  };
}

function stageFromStatus(value) {
  const s = String(value || "").toUpperCase();
  if (s.includes("SCRIPT")) return "script";
  if (s.includes("AUDIO")) return "voice";
  if (s.includes("AVATAR")) return "avatar";
  if (s.includes("RENDER") || s.includes("ASSETS")) return "render";
  if (s.includes("UPLOAD")) return "publish";
  return null;
}

/**
 * Stage states derived from a status string alone.
 *
 * The cross-type jobs endpoint returns normalised records without
 * `script.scenes` (see backend jobAggregatorService.normalizeVideo), so the
 * richer stagesFromJob above can't be used there. This is the degraded but
 * honest version: it marks stages before the current one as done, the
 * current one by its state, and the rest as untouched - never claiming
 * knowledge it doesn't have.
 */
const ORDER = ["script", "voice", "avatar", "render", "publish"];

export function stagesFromStatus(status) {
  const s = String(status || "").toUpperCase();

  if (s === "COMPLETED") {
    return Object.fromEntries(ORDER.map((id) => [id, STATE.DONE]));
  }

  const current = currentStageOf(s);
  if (!current) {
    // Two different unknowns, and they must not look the same.
    //
    // A queued job genuinely has an all-idle pipeline. A failed or cancelled
    // one definitely got somewhere - this record just doesn't say where (the
    // aggregated shape has no error.step). Returning all-idle for those would
    // draw a pipeline claiming nothing ever ran, so return null and let the
    // caller render "unknown" instead of a confident lie.
    if (s === "FAILED" || s === "CANCELLED" || s === "ERROR") return null;
    return Object.fromEntries(ORDER.map((id) => [id, STATE.IDLE]));
  }

  const failed = s === "FAILED" || s === "CANCELLED";
  const waiting = s.endsWith("_COMPLETED") || s === "AWAITING_APPROVAL" || s === "RETRY_SCHEDULED";
  const index = ORDER.indexOf(current);

  return Object.fromEntries(
    ORDER.map((id, i) => {
      if (i < index) return [id, STATE.DONE];
      if (i > index) return [id, STATE.IDLE];
      if (failed) return [id, STATE.FAIL];
      return [id, waiting ? STATE.WAIT : STATE.RUN];
    })
  );
}

function currentStageOf(s) {
  // A "<stage> completed" status means that stage is done and the *next*
  // one is the gate the job is sitting at.
  if (s === "AUDIO_COMPLETED") return "render";
  if (s === "SCRIPT_COMPLETED" || s === "AWAITING_APPROVAL") return "voice";
  if (s.includes("SCRIPT")) return "script";
  if (s.includes("AUDIO") || s.includes("VOICE")) return "voice";
  if (s.includes("AVATAR")) return "avatar";
  if (s.includes("RENDER") || s.includes("ASSETS")) return "render";
  if (s.includes("UPLOAD")) return "publish";
  return null;
}
