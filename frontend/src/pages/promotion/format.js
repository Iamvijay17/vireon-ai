// Pure helpers for the Promotion Studio page: labels, time zones, calendar math and metric formatting.
// No React in here so it can be unit tested. The backend stays authoritative for every rule; the helpers
// here only make the screen read well.

export const STATUS_META = {
  DRAFT: { label: "Draft", variant: "neutral", active: false },
  SCHEDULED: { label: "Scheduled", variant: "info", active: false },
  QUEUED: { label: "Queued", variant: "info", active: true },
  VALIDATING: { label: "Checking", variant: "accent", active: true },
  UPLOADING: { label: "Sending media", variant: "accent", active: true },
  PROCESSING: { label: "Processing", variant: "accent", active: true },
  RETRYING: { label: "Retrying", variant: "warning", active: true },
  COMPLETED: { label: "Published", variant: "success", active: false },
  FAILED: { label: "Failed", variant: "danger", active: false },
  CANCELLED: { label: "Cancelled", variant: "neutral", active: false },
};

export const statusMeta = (status) => STATUS_META[status] || { label: status || "Unknown", variant: "neutral", active: false };
export const isActiveStatus = (status) => Boolean(STATUS_META[status]?.active);
export const isFinishedStatus = (status) => ["COMPLETED", "FAILED", "CANCELLED"].includes(status);
export const STATUS_FILTERS = ["SCHEDULED", "QUEUED", "PROCESSING", "RETRYING", "COMPLETED", "FAILED", "CANCELLED"];

export const PLATFORMS = ["facebook", "instagram", "threads"];

// Plain letter tiles on purpose: no platform logos are bundled or imitated. Colours are literal (not theme
// tokens) so a tile stays recognisable in both themes.
export const PLATFORM_META = {
  facebook: { label: "Facebook", short: "f", color: "#1877f2", accountNoun: "Page" },
  instagram: { label: "Instagram", short: "IG", color: "#c13584", accountNoun: "account" },
  threads: { label: "Threads", short: "@", color: "#262626", accountNoun: "profile" },
};

export const platformLabel = (p) => PLATFORM_META[p]?.label || p || "";

export const FORMAT_LABEL = { reel: "Reel", video: "Video", image: "Image", text: "Text post" };

export const TONES = [
  { value: "casual", label: "Casual" },
  { value: "professional", label: "Professional" },
  { value: "educational", label: "Educational" },
  { value: "entertaining", label: "Entertaining" },
  { value: "promotional", label: "Promotional" },
];

/** What the OAuth callback told the SPA (?connect=<code>&provider=<meta|threads>) in plain language. */
export const connectResultMessage = (code, provider, count) => {
  const name = provider === "threads" ? "Threads" : "Facebook / Instagram";
  switch (code) {
    case "connected":
      return {
        type: "success", title: `${name} connected`,
        message: count > 1 ? `${count} accounts are ready to use.` : "The account is ready to use.",
      };
    case "denied":
      return { type: "warning", title: "Connection cancelled", message: `${name} access was declined, so nothing was connected.` };
    case "state":
      return { type: "error", title: "That sign-in link expired", message: "The sign-in link was invalid, already used, or older than 10 minutes. Start the connection again." };
    case "scopes":
      return { type: "error", title: "Required permissions were not granted", message: "Vireon needs permission to publish. Connect again and leave every permission ticked." };
    case "no_pages":
      return { type: "error", title: "No usable Page found", message: "No Facebook Page where you can create content was shared with Vireon. Connect again and select at least one Page." };
    case "not_configured":
      return { type: "error", title: `${name} is not configured`, message: "The server has no app credentials for it yet. See docs/social-promotion.md." };
    default:
      return { type: "error", title: "Could not finish connecting", message: "Something went wrong exchanging the sign-in. Check the server log and try again." };
  }
};

// ── numbers & text ──────────────────────────────────────────────────────────

export const formatSeconds = (s) => {
  if (!Number.isFinite(s) || s <= 0) return "";
  const m = Math.floor(s / 60);
  const sec = Math.round(s % 60);
  return m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m}:${String(sec).padStart(2, "0")}`;
};

export const formatBytes = (n) => {
  if (!Number.isFinite(n) || n <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.min(units.length - 1, Math.floor(Math.log(n) / Math.log(1024)));
  const v = n / 1024 ** i;
  return `${v >= 100 || i === 0 ? Math.round(v) : v.toFixed(1)} ${units[i]}`;
};

export const formatCount = (n) => {
  if (!Number.isFinite(n)) return "";
  if (Math.abs(n) >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
  if (Math.abs(n) >= 10_000) return `${Math.round(n / 1000)}K`;
  return n.toLocaleString();
};

export const parseHashtagInput = (text) => {
  const seen = new Set();
  const out = [];
  for (const raw of String(text || "").split(/[\s,]+/)) {
    const word = raw.replace(/^#+/, "").replace(/[^\p{L}\p{N}_]/gu, "");
    if (word && !seen.has(word.toLowerCase())) {
      seen.add(word.toLowerCase());
      out.push(`#${word}`);
    }
  }
  return out;
};

export const hashtagsToInput = (tags) => (tags || []).join(" ");

// ── time zones ──────────────────────────────────────────────────────────────

export const browserTimeZone = () => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
};

const FALLBACK_ZONES = ["UTC", "America/Los_Angeles", "America/New_York", "America/Sao_Paulo", "Europe/London", "Europe/Berlin", "Africa/Lagos", "Asia/Dubai", "Asia/Kolkata", "Asia/Singapore", "Asia/Tokyo", "Australia/Sydney"];

export const timeZoneOptions = () => {
  let zones = FALLBACK_ZONES;
  try {
    if (typeof Intl.supportedValuesOf === "function") zones = ["UTC", ...Intl.supportedValuesOf("timeZone").filter((z) => z !== "UTC")];
  } catch {
    /* use the fallback list */
  }
  const own = browserTimeZone();
  if (!zones.includes(own)) zones = [own, ...zones];
  return zones.map((z) => ({ value: z, label: z.replace(/_/g, " ") }));
};

const pad = (n) => String(n).padStart(2, "0");

/** The wall-clock parts of an instant in a zone. */
export function zonedParts(date, timeZone) {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit",
  });
  const out = {};
  for (const { type, value } of dtf.formatToParts(date)) out[type] = Number(value);
  return out;
}

/** An instant as the "YYYY-MM-DDTHH:mm" the schedule form (and the API's localDateTime) uses, in the zone. */
export function toZonedInput(date, timeZone) {
  const d = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(d.getTime())) return "";
  const p = zonedParts(d, timeZone);
  return `${p.year}-${pad(p.month)}-${pad(p.day)}T${pad(p.hour)}:${pad(p.minute)}`;
}

/** Wall-clock text in a zone -> the UTC instant (mirrors the server so the preview matches what is stored). */
export function zonedToUtc(localDateTime, timeZone) {
  const m = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})$/.exec(String(localDateTime || ""));
  if (!m) return null;
  const naive = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4]), Number(m[5]));
  const check = new Date(naive);
  if (check.getUTCMonth() !== Number(m[2]) - 1 || check.getUTCDate() !== Number(m[3])) return null;
  const offset = (at) => {
    const p = zonedParts(new Date(at), timeZone);
    return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - Math.floor(at / 1000) * 1000;
  };
  let guess = naive - offset(naive);
  const corrected = naive - offset(guess);
  if (corrected !== guess) guess = corrected;
  return new Date(guess);
}

/** A sensible default publish time: the next whole hour at least `minMinutes` away, as wall-clock text in the zone. */
export function defaultScheduleInput(timeZone, now = Date.now(), minMinutes = 30) {
  const base = toZonedInput(new Date(now + minMinutes * 60_000), timeZone); // "YYYY-MM-DDTHH:mm" in the zone
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):\d{2}$/.exec(base);
  if (!m) return "";
  const next = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4]) + 1, 0));
  return `${next.getUTCFullYear()}-${pad(next.getUTCMonth() + 1)}-${pad(next.getUTCDate())}T${pad(next.getUTCHours())}:00`;
}

export function formatInZone(value, timeZone, opts = {}) {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  try {
    return new Intl.DateTimeFormat(undefined, { timeZone, dateStyle: "medium", timeStyle: "short", ...opts }).format(d);
  } catch {
    return d.toLocaleString();
  }
}

/** "in 3 h" / "2 days ago" style distance. */
export function describeDistance(value, now = Date.now()) {
  const t = new Date(value).getTime();
  if (Number.isNaN(t)) return "";
  const diff = t - now;
  const abs = Math.abs(diff);
  const unit = abs < 3600_000 ? [Math.max(1, Math.round(abs / 60_000)), "min"] : abs < 86400_000 ? [Math.round(abs / 3600_000), "h"] : [Math.round(abs / 86400_000), abs >= 2 * 86400_000 ? "days" : "day"];
  return diff >= 0 ? `in ${unit[0]} ${unit[1]}` : `${unit[0]} ${unit[1]} ago`;
}

// ── calendar ────────────────────────────────────────────────────────────────

export const dayKey = (value, timeZone) => {
  const p = zonedParts(new Date(value), timeZone);
  return `${p.year}-${pad(p.month)}-${pad(p.day)}`;
};

/** Weeks (Mon-first) of a month: arrays of 7 { key, day, inMonth } cells. */
export function monthGrid(year, month) {
  const first = new Date(Date.UTC(year, month, 1));
  const lead = (first.getUTCDay() + 6) % 7; // Monday = 0
  const start = Date.UTC(year, month, 1 - lead);
  const weeks = [];
  for (let w = 0; w < 6; w += 1) {
    const row = [];
    for (let d = 0; d < 7; d += 1) {
      const cell = new Date(start + (w * 7 + d) * 86400_000);
      row.push({ key: `${cell.getUTCFullYear()}-${pad(cell.getUTCMonth() + 1)}-${pad(cell.getUTCDate())}`, day: cell.getUTCDate(), inMonth: cell.getUTCMonth() === month });
    }
    if (w >= 4 && row.every((c) => !c.inMonth)) break;
    weeks.push(row);
  }
  return weeks;
}

export const groupByDay = (items, timeZone) => {
  const map = new Map();
  for (const item of items) {
    if (!item.at) continue;
    const key = dayKey(item.at, timeZone);
    map.set(key, [...(map.get(key) || []), item]);
  }
  for (const list of map.values()) list.sort((a, b) => new Date(a.at) - new Date(b.at));
  return map;
};

// ── analytics ───────────────────────────────────────────────────────────────

/**
 * A metric for display. "Unavailable" is a first-class answer and is never rendered as 0.
 * @returns {{text: string, available: boolean}}
 */
export function formatMetric(key, metric) {
  if (!metric || !metric.available || metric.value === null || metric.value === undefined) return { text: "Not available", available: false };
  if (key === "avgWatchTimeMs") return { text: `${(metric.value / 1000).toFixed(1)} s`, available: true };
  return { text: formatCount(metric.value), available: true };
}

export const successRateText = (rate) => (rate === null || rate === undefined ? "—" : `${rate}%`);

/** Latest socket summary wins over the fetched row when it is at least as new. */
export function mergeLive(post, live) {
  if (!live) return post;
  const liveTime = live.updatedAt ? new Date(live.updatedAt).getTime() : 0;
  const rowTime = post.updatedAt ? new Date(post.updatedAt).getTime() : 0;
  if (liveTime < rowTime) return post;
  return {
    ...post,
    status: live.status ?? post.status,
    progress: live.progress ?? post.progress,
    remote: live.remote ? { ...post.remote, ...live.remote } : post.remote,
    error: live.error ?? (live.status === post.status ? post.error : null),
    nextRetryAt: live.nextRetryAt ?? post.nextRetryAt,
    attempts: live.attempts ?? post.attempts,
  };
}

export const SEVERITY_LABEL = { error: "Must fix", warning: "Heads up" };
