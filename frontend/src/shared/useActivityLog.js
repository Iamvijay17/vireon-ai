import { useState, useCallback } from "react";
import { formatActivityTime } from "../lib/formatActivityTime";

/**
 * The pipeline activity timeline: the durable server-backed log, plus
 * optimistic local entries appended the moment a user action or socket
 * event happens, so the timeline feels immediate instead of waiting for
 * the next fetch.
 *
 * One hook for both pipelines. It takes a `fetcher` rather than importing
 * an API function, because that is the only thing that genuinely differed
 * between the two copies this replaces (video jobs vs course videos);
 * everything else - the state, the mapping, the swallowed error, the time
 * formatting - was identical, duplicated prose.
 *
 * `fetcher` must be a stable reference (useCallback at the call site or a
 * module-level function); it is a dependency of fetchActivityLogs below.
 */
export function useActivityLog(fetcher) {
  const [activityLog, setActivityLog] = useState([]);

  // Args are forwarded to `fetcher`, so both existing call styles keep
  // working: the course editor closes over its videoId and calls
  // fetchActivityLogs(), while the render page's socket hook passes the id
  // explicitly as fetchActivityLogs(jobId).
  const fetchActivityLogs = useCallback(async (...args) => {
    if (!fetcher) return;
    try {
      const res = await fetcher(...args);
      setActivityLog(
        (res.data.logs || []).map((log) => ({
          text: log.text,
          time: formatActivityTime(log.timestamp),
        }))
      );
    } catch {
      // Deliberately swallowed: the activity log is supplementary context
      // next to the real status. Failing to load it should never surface
      // an error over a page whose primary data loaded fine.
    }
  }, [fetcher]);

  /** Prepend an entry locally, ahead of it appearing in a server fetch. */
  const addActivity = useCallback((text, timestamp) => {
    setActivityLog((prev) => [
      { text, time: formatActivityTime(timestamp || new Date().toISOString()) },
      ...prev,
    ]);
  }, []);

  return { activityLog, fetchActivityLogs, addActivity, setActivityLog };
}

export default useActivityLog;
