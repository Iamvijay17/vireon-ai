/**
 * Single status -> tone mapping shared by StatusTag and the analytics charts,
 * so a job/course/video status always reads as the same color everywhere.
 * Works across the pipeline's mixed status vocabularies (SCREAMING_CASE
 * machine tokens and "Title Case" human strings) via keyword matching.
 */
export const classifyStatus = (status) => {
  const s = (status || "").toLowerCase();
  if (s.includes("cancel")) return "cancelled";
  if (s.includes("fail")) return "error";
  if (s.includes("complete") || s.includes("done") || s.includes("approved")) return "success";
  if (s.includes("queue") || s.includes("draft") || s.includes("waiting") || s.includes("pending")) return "default";
  return "processing"; // generating / rendering / preparing / uploading / in-progress
};

export const STATUS_TONE_HEX = {
  success: "var(--color-success-500)",
  error: "var(--color-danger-500)",
  default: "var(--color-neutral-400)",
  processing: "var(--color-accent-500)",
  cancelled: "var(--color-neutral-400)",
};

export const toneForStatus = (status) => STATUS_TONE_HEX[classifyStatus(status)];
