/**
 * Display rules for the GPU & Resources page, kept apart from the components
 * so the wording - and especially what is said when a figure is missing - is
 * testable.
 */

export const SERVICE_LABELS = {
  llm: { name: "Language model", detail: "Ollama - writes scripts and plans scenes" },
  tts: { name: "Text-to-speech", detail: "Narration and voices" },
  comfyui: { name: "Image generation", detail: "ComfyUI - scene images" },
  remotion: { name: "Renderer", detail: "Remotion - CPU-based video rendering" },
};

/**
 * An AI service's state as a badge. "Stopped" is a normal resting state, not a
 * fault: the GPU scheduler starts a service when a job needs it and stops it
 * to free VRAM for the next one.
 */
export function serviceState(status) {
  switch (status) {
    case "ready":
      return { label: "Ready", variant: "success", note: "Loaded and answering" };
    case "starting":
      return { label: "Starting", variant: "accent", note: "Loading - this can take a minute" };
    case "busy":
      return { label: "Busy", variant: "accent", note: "Working on a task" };
    case "idle":
      return { label: "Idle", variant: "neutral", note: "Nothing to render" };
    case "stopped":
      return { label: "Stopped", variant: "neutral", note: "Starts on demand when a job needs it" };
    case "unhealthy":
      return { label: "Not responding", variant: "warning", note: "The process is running but failing its health check" };
    case "failed":
      return { label: "Failed", variant: "danger", note: "The last start attempt failed" };
    default:
      return { label: "Unknown", variant: "neutral", note: "No status reported" };
  }
}

const BREAKER = {
  closed: { label: "Healthy", variant: "success" },
  open: { label: "Paused after failures", variant: "danger" },
  "half-open": { label: "Testing recovery", variant: "warning" },
  half_open: { label: "Testing recovery", variant: "warning" },
};

/** Circuit breaker state -> badge, with how long until it tries again when it is open. */
export function breakerState(breaker) {
  const base = BREAKER[breaker?.state] || { label: breaker?.state || "Unknown", variant: "neutral" };
  const retryIn = Number.isFinite(breaker?.retryAfterMs) && breaker.retryAfterMs > 0 ? breaker.retryAfterMs : null;
  return { ...base, retryInMs: retryIn, failures: breaker?.consecutiveFailures ?? 0, lastError: breaker?.lastError || null };
}

/** How a GPU task's status reads in the table. */
export function taskStatus(task) {
  if (task.stale) return { label: "No heartbeat", variant: "warning" };
  switch (task.status) {
    case "running":
      return { label: "Running", variant: "accent" };
    case "queued":
      return { label: "Waiting", variant: "neutral" };
    case "retrying":
      return { label: "Retrying", variant: "warning" };
    case "completed":
      return { label: "Done", variant: "success" };
    case "failed":
      return { label: "Failed", variant: "danger" };
    case "cancelled":
      return { label: "Cancelled", variant: "neutral" };
    case "abandoned":
      return { label: "Abandoned", variant: "danger" };
    default:
      return { label: task.status, variant: "neutral" };
  }
}

/** The time a task has spent in its current state, measured at `now`. */
export function taskElapsedMs(task, now = Date.now()) {
  if (task.status === "running" && task.startedAt) return now - new Date(task.startedAt).getTime();
  if ((task.status === "queued" || task.status === "retrying") && task.enqueuedAt) return now - new Date(task.enqueuedAt).getTime();
  return task.runMs ?? null;
}

/** "RTX 2060" style one-line headline for the card: what the GPU is doing right now. */
export function gpuHeadline(resources, aiGpu) {
  const running = (resources?.gpuTasks?.active || []).filter((t) => t.status === "running");
  if (running.length > 0) {
    return `Running: ${running.map((t) => t.label || t.service).join(", ")}`;
  }
  if (resources?.gpuTasks?.available === false) return "GPU task history is unavailable";
  if (aiGpu?.currentService) return `Holding the GPU: ${aiGpu.currentService}`;
  return "No GPU task is running";
}
