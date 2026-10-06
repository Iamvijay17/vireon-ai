export const MAX_ENTRIES = 200;

// Mirrors backend/src/services/LoggerService.js customLevels - only levels that
// are broadcast over the 'serverLog' socket event (http/debug are dropped
// server-side as too noisy for a pipeline-activity console).
export const LEVEL_META = {
  error: { label: "Error", text: "text-red-600 dark:text-red-400" },
  warn: { label: "Warn", text: "text-amber-600 dark:text-amber-400" },
  info: { label: "Info", text: "text-sky-600 dark:text-sky-400" },
  llm: { label: "LLM", text: "text-violet-600 dark:text-violet-400" },
  tts: { label: "TTS", text: "text-emerald-600 dark:text-emerald-400" },
  render: { label: "Render", text: "text-slate-600 dark:text-slate-400" },
  upload: { label: "Upload", text: "text-orange-600 dark:text-orange-400" },
};

export const formatTime = (timestamp) => {
  if (!timestamp) return "--:--:--";
  const d = new Date(timestamp);
  if (Number.isNaN(d.getTime())) return String(timestamp).slice(11, 19) || "--:--:--";
  return d.toLocaleTimeString(undefined, { hour12: false });
};

// Every entry needs a stable key even though the backend doesn't assign ids.
let seq = 0;
export const withKey = (entry) => ({ ...entry, _key: `${Date.now()}-${seq++}` });

// The backend's log lines have no id, so the same line arriving once over the
// socket and once in the history fetch is recognised by its content.
const signature = (entry) => `${entry.timestamp}|${entry.level}|${entry.message}`;

const capped = (list) => (list.length > MAX_ENTRIES ? list.slice(list.length - MAX_ENTRIES) : list);

// History first, then any live lines the socket delivered before the history
// arrived that the history doesn't already contain.
export const mergeHistory = (history, live) => {
  const seen = new Set(history.map(signature));
  return capped([...history, ...live.filter((entry) => !seen.has(signature(entry)))]);
};

export const appendEntry = (entries, entry) => capped([...entries, entry]);
