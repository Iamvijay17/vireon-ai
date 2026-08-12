const UNITS = [
  { max: 60, div: 1, label: "s" },
  { max: 3600, div: 60, label: "m" },
  { max: 86400, div: 3600, label: "h" },
  { max: 604800, div: 86400, label: "d" },
];

/** Compact relative time ("3m ago"), falling back to a locale date past a week out. */
export const timeAgo = (timestamp) => {
  if (!timestamp) return "—";
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return "—";
  const seconds = Math.max(0, (Date.now() - date.getTime()) / 1000);
  if (seconds < 5) return "just now";
  for (const { max, div, label } of UNITS) {
    if (seconds < max) return `${Math.floor(seconds / div)}${label} ago`;
  }
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
};

export default timeAgo;
