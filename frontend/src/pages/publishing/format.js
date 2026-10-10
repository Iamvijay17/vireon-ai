// Pure helpers for the Publishing page: labels, form <-> API conversion and
// the same cheap limits the backend enforces, so a mistake shows next to the
// field instead of after a round trip. The backend remains authoritative.

export const STATUS_META = {
  DRAFT: { label: "Draft", variant: "neutral", active: false },
  QUEUED: { label: "Queued", variant: "info", active: true },
  VALIDATING: { label: "Validating", variant: "accent", active: true },
  UPLOADING: { label: "Uploading", variant: "accent", active: true },
  PROCESSING: { label: "Processing", variant: "accent", active: true },
  RETRYING: { label: "Retrying", variant: "warning", active: true },
  COMPLETED: { label: "Completed", variant: "success", active: false },
  FAILED: { label: "Failed", variant: "danger", active: false },
  CANCELLED: { label: "Cancelled", variant: "neutral", active: false },
};

export const statusMeta = (status) => STATUS_META[status] || { label: status || "Unknown", variant: "neutral", active: false };
export const isActiveStatus = (status) => Boolean(STATUS_META[status]?.active);
export const isFinishedStatus = (status) => ["COMPLETED", "FAILED", "CANCELLED"].includes(status);

export const PLATFORM_LABEL = { youtube: "YouTube", "udemy-export": "Udemy package" };

export const formatBytes = (n) => {
  if (!Number.isFinite(n) || n <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.min(units.length - 1, Math.floor(Math.log(n) / Math.log(1024)));
  const v = n / 1024 ** i;
  return `${v >= 100 || i === 0 ? Math.round(v) : v.toFixed(1)} ${units[i]}`;
};

export const formatSeconds = (s) => {
  if (!Number.isFinite(s) || s <= 0) return "";
  const m = Math.floor(s / 60);
  const sec = Math.round(s % 60);
  return m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m}:${String(sec).padStart(2, "0")}`;
};

/** What the OAuth callback told the SPA (?connect=<code>) in plain language. */
export const CONNECT_MESSAGES = {
  connected: { type: "success", title: "YouTube account connected", message: "You can now create publishing drafts for this channel." },
  denied: { type: "warning", title: "Connection cancelled", message: "Google access was declined, so nothing was connected." },
  state: { type: "error", title: "That sign-in link expired", message: "The sign-in link was invalid, already used, or older than 10 minutes. Start the connection again." },
  scopes: { type: "error", title: "Required permissions were not granted", message: "Vireon needs both permissions: upload videos and view your channel. Connect again and leave both ticked." },
  no_channel: { type: "error", title: "No YouTube channel found", message: "That Google account has no YouTube channel. Create one on YouTube, then connect again." },
  no_refresh: { type: "error", title: "Google did not issue a long-lived permission", message: "Remove Vireon from your Google account's third-party access list, then connect again." },
  not_configured: { type: "error", title: "Google OAuth is not configured", message: "The server has no Google credentials yet. See docs/publishing.md." },
  failed: { type: "error", title: "Could not finish connecting", message: "Something went wrong exchanging the Google sign-in. Check the server log and try again." },
};

export const connectResultMessage = (code) => CONNECT_MESSAGES[code] || CONNECT_MESSAGES.failed;

// ── metadata form ───────────────────────────────────────────────────────────

const pad = (n) => String(n).padStart(2, "0");

/** ISO timestamp -> value for <input type="datetime-local"> in the user's own timezone. */
export const toLocalInput = (iso) => {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

export const fromLocalInput = (value) => {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
};

export const parseTags = (text) => {
  const seen = new Set();
  const out = [];
  for (const raw of String(text || "").split(/[,\n]/)) {
    const tag = raw.trim().replace(/\s+/g, " ");
    if (tag && !seen.has(tag.toLowerCase())) {
      seen.add(tag.toLowerCase());
      out.push(tag);
    }
  }
  return out;
};

export const metadataToForm = (m = {}) => ({
  title: m.title || "",
  description: m.description || "",
  tags: (m.tags || []).join(", "),
  categoryId: m.categoryId || "27",
  language: m.language || "",
  privacyStatus: m.privacyStatus || "private",
  publishAt: toLocalInput(m.publishAt),
  madeForKids: Boolean(m.madeForKids),
  containsSyntheticMedia: m.containsSyntheticMedia !== false,
});

export const formToMetadata = (f) => ({
  title: f.title.trim(),
  description: f.description,
  tags: parseTags(f.tags),
  categoryId: f.categoryId,
  language: f.language.trim(),
  privacyStatus: f.publishAt ? "private" : f.privacyStatus,
  publishAt: fromLocalInput(f.publishAt),
  madeForKids: f.madeForKids,
  containsSyntheticMedia: f.containsSyntheticMedia,
});

export const utf8Bytes = (s) => new TextEncoder().encode(s).length;

/** YouTube counts quotes around tags with spaces and the commas between tags. */
export const tagsLength = (tags) => tags.reduce((sum, t, i) => sum + t.length + (/\s/.test(t) ? 2 : 0) + (i > 0 ? 1 : 0), 0);

export const LIMITS = { title: 100, descriptionBytes: 5000, tagsChars: 500 };

/** Field -> message, mirroring the backend's checks. Empty object = looks fine. */
export function validateMetadataForm(form, { privacyOptions = ["private"], schedulingAvailable = false, now = Date.now() } = {}) {
  const errors = {};
  const title = form.title.trim();
  if (!title) errors.title = "A title is required";
  else if (title.length > LIMITS.title) errors.title = `Title must be at most ${LIMITS.title} characters`;
  else if (/[<>]/.test(title)) errors.title = "Title cannot contain < or >";

  if (/[<>]/.test(form.description)) errors.description = "Description cannot contain < or >";
  else if (utf8Bytes(form.description) > LIMITS.descriptionBytes) errors.description = `Description must be at most ${LIMITS.descriptionBytes} bytes`;

  const tags = parseTags(form.tags);
  if (tags.some((t) => /[<>]/.test(t))) errors.tags = "Tags cannot contain < or >";
  else if (tagsLength(tags) > LIMITS.tagsChars) errors.tags = `Tags must total at most ${LIMITS.tagsChars} characters`;

  if (form.language.trim() && !/^[a-zA-Z]{2,3}(-[A-Za-z0-9]{2,8})*$/.test(form.language.trim())) errors.language = 'Use a code such as "en" or "pt-BR"';

  if (!privacyOptions.includes(form.privacyStatus) && !form.publishAt) errors.privacyStatus = "That visibility is not available for this Google API project yet";

  if (form.publishAt) {
    const at = new Date(form.publishAt).getTime();
    if (!schedulingAvailable) errors.publishAt = "Scheduling needs a verified Google API project";
    else if (Number.isNaN(at) || at < now + 5 * 60_000) errors.publishAt = "Choose a time at least 5 minutes from now";
  }
  return errors;
}

/** Latest socket summary wins over the fetched row when it is at least as new. */
export function mergeLive(job, live) {
  if (!live) return job;
  const liveTime = live.updatedAt ? new Date(live.updatedAt).getTime() : 0;
  const rowTime = job.updatedAt ? new Date(job.updatedAt).getTime() : 0;
  if (liveTime < rowTime) return job;
  return {
    ...job,
    status: live.status ?? job.status,
    progress: live.progress ?? job.progress,
    remote: live.remote ? { ...job.remote, ...live.remote } : job.remote,
    error: live.error ?? (live.status === job.status ? job.error : null),
    nextRetryAt: live.nextRetryAt ?? job.nextRetryAt,
    attempts: live.attempts ?? job.attempts,
  };
}

export const humanizeIssueSeverity = { error: "Must fix", warning: "Recommended", info: "Note" };
