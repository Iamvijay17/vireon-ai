import { useEffect, useRef, useState } from "react";
import { getRecentLogs } from "../../services/api";
import { connect, onServerLog } from "../../services/socket";
import { withKey, mergeHistory, appendEntry } from "./logEntries";

/**
 * Live server log lines: streamed over the socket from mount, with the recent
 * history merged in the first time `active` turns true.
 */
export function useLogStream(active) {
  const [entries, setEntries] = useState([]);

  // Connect so live lines start streaming. The socket service exposes a shared
  // singleton, so connecting here is safe even on the logs page itself.
  useEffect(() => {
    connect();
    return onServerLog((data) => setEntries((prev) => appendEntry(prev, withKey(data))));
  }, []);

  // Load the recent history the first time the drawer is opened - not on
  // every page load, when the drawer is closed and nobody can see it (it was
  // a 5 KB request on every route). A failed load is retried on next open.
  const hydratedRef = useRef(false);
  useEffect(() => {
    if (!active || hydratedRef.current) return;
    hydratedRef.current = true;
    getRecentLogs(200)
      .then((res) => {
        const history = (res.data.logs || []).map(withKey);
        setEntries((live) => mergeHistory(history, live));
      })
      .catch(() => {
        hydratedRef.current = false;
      });
  }, [active]);

  return entries;
}
