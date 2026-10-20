import { useCallback, useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { getHealth } from "../services/api";

// Consecutive failed checks before the app calls the server "down". One miss is
// usually a request that raced a `node --watch` restart or a slow event loop;
// two in a row (a few seconds apart) is a real outage worth interrupting for.
export const DOWN_AFTER_FAILURES = 2;
const HEALTHY_INTERVAL_MS = 15_000;
const PROBE_TIMEOUT_MS = 5_000;
// Right after a miss, look again quickly (a restart is usually seconds), then ease off.
const RETRY_BACKOFF_MS = [2_000, 3_000, 5_000, 8_000, 10_000];

export const INITIAL_BACKEND_STATE = Object.freeze({
  status: "unknown", // "unknown" | "up" | "down"
  failures: 0,
  kind: null, // why it is down: "unreachable" (no answer at all) | "restarting" (a gateway answered 5xx)
  downSince: null,
  lastCheckedAt: null,
});

/** How long to wait before the next check, given what the last one found. */
export function nextCheckDelay(state) {
  if (state.failures === 0) return HEALTHY_INTERVAL_MS;
  return RETRY_BACKOFF_MS[Math.min(state.failures - 1, RETRY_BACKOFF_MS.length - 1)];
}

/** Pure state step: fold one probe result into the status. */
export function nextBackendState(prev, result, now) {
  if (result.ok) {
    return { status: "up", failures: 0, kind: null, downSince: null, lastCheckedAt: now };
  }
  const failures = prev.failures + 1;
  const down = failures >= DOWN_AFTER_FAILURES;
  return {
    status: down ? "down" : prev.status,
    failures,
    kind: down ? result.kind : prev.kind,
    downSince: down ? (prev.downSince ?? now) : prev.downSince,
    lastCheckedAt: now,
  };
}

/**
 * One liveness check against the API's /health. Any HTTP answer below 500 means the
 * process is alive (even a 404 from an older build); no answer, or a 5xx from the
 * proxy in front of it, means it is not.
 */
export async function probeBackend() {
  try {
    await getHealth({ timeout: PROBE_TIMEOUT_MS });
    return { ok: true };
  } catch (error) {
    const status = error.response?.status;
    if (status && status < 500) return { ok: true };
    return { ok: false, kind: status ? "restarting" : "unreachable", status };
  }
}

/**
 * Watches whether the backend answers, so the app can say so plainly instead of
 * every page failing in its own way. Polls slowly while healthy and quickly while
 * failing, re-checks the moment the tab regains focus or the network returns, and
 * refetches every query once the server comes back.
 *
 * Returns the state plus `checking`, `nextCheckAt` (ms epoch, for a countdown) and
 * `retry()` for an immediate check.
 */
export function useBackendStatus(probe = probeBackend) {
  const queryClient = useQueryClient();
  const [state, setState] = useState(INITIAL_BACKEND_STATE);
  const [schedule, setSchedule] = useState({ checking: true, nextCheckAt: null });
  const runRef = useRef(null);
  // `probe` is read through a ref so a new function identity never restarts the poll loop.
  const probeRef = useRef(probe);
  useEffect(() => {
    probeRef.current = probe;
  }, [probe]);

  useEffect(() => {
    let cancelled = false;
    let timer = null;
    let current = INITIAL_BACKEND_STATE;
    let running = false;

    const run = async () => {
      if (running) return;
      running = true;
      clearTimeout(timer);
      setSchedule((s) => ({ ...s, checking: true }));
      const result = await probeRef.current();
      running = false;
      if (cancelled) return;

      const previous = current;
      current = nextBackendState(previous, result, Date.now());
      setState(current);
      // Whatever failed while the server was away is stale: refetch it all.
      if (previous.status === "down" && current.status === "up") queryClient.invalidateQueries();

      const delay = nextCheckDelay(current);
      setSchedule({ checking: false, nextCheckAt: Date.now() + delay });
      timer = setTimeout(run, delay);
    };
    runRef.current = run;

    const recheckIfTrouble = () => {
      if (current.status !== "up") run();
    };
    const onVisible = () => {
      if (document.visibilityState === "visible") recheckIfTrouble();
    };
    window.addEventListener("online", recheckIfTrouble);
    document.addEventListener("visibilitychange", onVisible);
    run();

    return () => {
      cancelled = true;
      clearTimeout(timer);
      runRef.current = null;
      window.removeEventListener("online", recheckIfTrouble);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [queryClient]);

  const retry = useCallback(() => runRef.current?.(), []);
  return { ...state, ...schedule, retry };
}

export default useBackendStatus;
