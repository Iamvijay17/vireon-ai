/** Shared number/size/duration formatting. A missing value is an em dash, never 0. */

export const formatDuration = (ms) => {
  if (!ms && ms !== 0) return "—";
  const seconds = ms / 1000;
  if (seconds < 60) return `${seconds.toFixed(1)}s`;
  const minutes = ms / 60000;
  if (minutes < 60) return `${minutes.toFixed(1)}m`;
  return `${(minutes / 60).toFixed(1)}h`;
};

export const formatBytes = (bytes) => {
  if (bytes === null || bytes === undefined || !Number.isFinite(bytes)) return "—";
  if (bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  return `${(bytes / 1024 ** i).toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
};

/** Megabytes (as nvidia-smi reports VRAM) -> "2.1 GB" / "812 MB". */
export const formatMb = (mb) => {
  if (mb === null || mb === undefined || !Number.isFinite(mb)) return "—";
  return mb >= 1024 ? `${(mb / 1024).toFixed(1)} GB` : `${Math.round(mb)} MB`;
};

/** "3m 12s" style, for a wait or a run that is counted in whole seconds. */
export const formatElapsed = (ms) => {
  if (ms === null || ms === undefined || !Number.isFinite(ms)) return "—";
  const total = Math.max(0, Math.round(ms / 1000));
  if (total < 60) return `${total}s`;
  const m = Math.floor(total / 60);
  if (m < 60) return `${m}m ${total % 60}s`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m`;
};

/** "GENERATING_AUDIO" / "In Progress" -> "Generating audio" / "In progress". */
export const humanizeStatus = (status) => {
  const text = String(status || "").replace(/_/g, " ").replace(/\s+/g, " ").trim().toLowerCase();
  return text ? text.charAt(0).toUpperCase() + text.slice(1) : "Unknown";
};
