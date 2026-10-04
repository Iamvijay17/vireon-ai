const UNITS = [
  { max: 60, div: 1, one: "sec", many: "sec" },
  { max: 3600, div: 60, one: "min", many: "min" },
  { max: 86400, div: 3600, one: "hour", many: "hours" },
  { max: 604800, div: 86400, one: "day", many: "days" },
];

/**
 * Spelled-out relative time: "1 sec ago", "5 min ago", "2 hours ago",
 * "3 days ago", then a short date once it is a week or more old. Distinct from
 * lib/timeAgo.js, which is the compact "5m ago" form the dashboard uses.
 */
export const relativeTime = (timestamp, now = Date.now()) => {
  if (!timestamp) return "-";
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return "-";

  const seconds = Math.max(0, (now - date.getTime()) / 1000);
  if (seconds < 1) return "just now";

  for (const { max, div, one, many } of UNITS) {
    if (seconds < max) {
      const n = Math.floor(seconds / div);
      return `${n} ${n === 1 ? one : many} ago`;
    }
  }
  return date.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
};

/** How long until the label can change, so a ticking view re-renders no more often than needed. */
export const relativeTimeRefreshMs = (timestamp, now = Date.now()) => {
  const seconds = Math.max(0, (now - new Date(timestamp).getTime()) / 1000);
  if (seconds < 60) return 1000;
  if (seconds < 3600) return 15000;
  return 60000;
};
