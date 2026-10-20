export { formatDuration } from "../../lib/format";

export const formatPercent = (v) => (v === null || v === undefined ? "—" : `${v}%`);

export { formatBytes } from "../../lib/format";

// Splits a trend series in half and returns the % change of `key`'s sum
// between the two halves - a lightweight period-over-period delta without
// needing a backend call.
export const trendDelta = (trend, key) => {
  const n = trend?.length || 0;
  if (n < 4) return null;
  const mid = Math.floor(n / 2);
  const sum = (rows) => rows.reduce((s, r) => s + (r[key] || 0), 0);
  const prev = sum(trend.slice(0, mid));
  const curr = sum(trend.slice(mid));
  if (!prev && !curr) return null;
  if (!prev) return { pct: 100, curr, prev };
  return { pct: Math.round(((curr - prev) / prev) * 100), curr, prev };
};

export const successRateSeries = (trend) =>
  (trend || []).map((d) => {
    const resolved = d.jobsCompleted + d.jobsFailed;
    return resolved ? Math.round((d.jobsCompleted / resolved) * 100) : 0;
  });

// Same half-vs-half comparison as trendDelta, but of the daily success rate,
// so the result is a change in percentage points rather than a % change.
export const successRateDelta = (trend) => {
  const rates = successRateSeries(trend);
  const n = rates.length;
  if (n < 4) return null;
  const mid = Math.floor(n / 2);
  const avg = (arr) => arr.reduce((s, v) => s + v, 0) / (arr.length || 1);
  const prev = avg(rates.slice(0, mid));
  const curr = avg(rates.slice(mid));
  if (!prev) return null;
  return { pct: Math.round(curr - prev) };
};
