/**
 * Human-friendly timestamp for activity-log entries: "today 6:21 pm",
 * "Tuesday 9:04 am", "last week 11:30 pm".
 *
 * Distinct from lib/timeAgo.js on purpose - that one is compact elapsed
 * time ("3m ago") for table cells, this one keeps the wall-clock time
 * because an activity log is read as a sequence of events at times, not as
 * a set of durations.
 *
 * Previously duplicated verbatim in pages/render/useActivityLog.js and
 * pages/courses/CourseVideoEditor/useActivityLog.js.
 */
const MS_PER_DAY = 86400000;

export function formatActivityTime(timestamp) {
  if (!timestamp) return "";

  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return "";

  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfWeek = new Date(today);
  startOfWeek.setDate(today.getDate() - today.getDay()); // Sunday
  const target = new Date(date.getFullYear(), date.getMonth(), date.getDate());

  const timeStr = date
    .toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true })
    .toLowerCase();

  // Whole calendar days apart, not elapsed hours - 11pm and 1am are
  // "yesterday" and "today" even though they are two hours apart.
  const diffDays = Math.round((today - target) / MS_PER_DAY);

  let label;
  if (diffDays < 0) {
    // A timestamp ahead of the client clock (clock skew between the
    // browser and the server). Better to say "today" than "in -1 days".
    label = "today";
  } else if (diffDays === 0) {
    label = "today";
  } else if (diffDays === 1) {
    label = "yesterday";
  } else if (target >= startOfWeek || diffDays <= 7) {
    // Inside the current week, or within the trailing 7 days - a weekday
    // name is unambiguous at that range.
    label = date.toLocaleDateString("en-US", { weekday: "long" });
  } else if (diffDays <= 14) {
    label = "last week";
  } else if (diffDays <= 60) {
    label = "last month";
  } else {
    label = date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  }

  return `${label} ${timeStr}`;
}

export default formatActivityTime;
