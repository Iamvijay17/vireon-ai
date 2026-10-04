import { useState, useEffect } from "react";
import { relativeTime, relativeTimeRefreshMs } from "../../lib/relativeTime";

/**
 * "5 min ago" that keeps itself current: re-renders once a second while the
 * label counts seconds, less often as it ages. The exact date and time is the
 * hover title, so nothing is lost by showing the relative form.
 */
export const RelativeTime = ({ value, className }) => {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!value) return undefined;
    const timer = setTimeout(() => setNow(Date.now()), relativeTimeRefreshMs(value, now));
    return () => clearTimeout(timer);
  }, [value, now]);

  if (!value) return null;
  const date = new Date(value);
  return (
    <time dateTime={date.toISOString()} title={date.toLocaleString()} className={className}>
      {relativeTime(value, now)}
    </time>
  );
};

export default RelativeTime;
