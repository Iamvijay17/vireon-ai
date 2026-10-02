import { useState, useEffect, useRef, useCallback } from "react";
import { getJobEvents } from "../services/api";
import {
  onJobCreated,
  onJobProgress,
  onJobCompleted,
  onJobFailed,
  onSceneAudioReady,
  onConnect,
  onDisconnect,
} from "../services/socket";

// Socket event name → JobEvent.type. Live payloads arrive without a `type`
// field (the type *is* the socket event name), so each listener tags it.
const LIVE_SOURCES = [
  ["jobCreated", onJobCreated],
  ["jobProgress", onJobProgress],
  ["jobCompleted", onJobCompleted],
  ["jobFailed", onJobFailed],
  ["sceneAudioReady", onSceneAudioReady],
];

/**
 * Merge new events into the list, keyed by `seq`. Events whose append failed
 * on the backend arrive without a seq; they're kept but can't be deduped,
 * so they get a client-side key and never overwrite anything.
 */
function merge(prev, incoming) {
  const bySeq = new Map(prev.filter((e) => e.seq != null).map((e) => [e.seq, e]));
  const unsequenced = prev.filter((e) => e.seq == null);
  for (const event of incoming) {
    if (event.seq == null) {
      unsequenced.push(event);
    } else if (!bySeq.has(event.seq) || (bySeq.get(event.seq).live && !event.live)) {
      // A REST copy beats a live copy of the same seq - it carries the real
      // server timestamp instead of the client's arrival time.
      bySeq.set(event.seq, { ...bySeq.get(event.seq), ...event });
    }
  }
  return [...bySeq.values(), ...unsequenced].sort((a, b) => (a.seq ?? Infinity) - (b.seq ?? Infinity));
}

/**
 * The full event timeline of one job: REST-loaded history plus live socket
 * events, deduplicated by seq. After a reconnect the gap is re-read from
 * REST (exclusive of the last seq seen) and those events are flagged
 * `replayed` so the UI can show they arrived late.
 *
 * Only the v1 video pipeline records events today, so `type` is 'video'
 * in practice; the signature mirrors /api/jobs/:type/:id/events.
 */
export function useJobEvents(type, jobId, { enabled = true } = {}) {
  // Events are stored together with the job key they belong to, so switching
  // jobs naturally reads as an empty list until the new job's history lands
  // (no reset-in-effect needed) and a late response for the previous job
  // can't leak into the new one.
  const key = enabled && type && jobId ? `${type}:${jobId}` : null;
  const [store, setStore] = useState({ key: null, events: [] });
  // Tracks the key of the load that's currently in flight, so `loading`
  // can be derived (not set) below - avoids a synchronous setState at the
  // top of the load effect, which only the microtask tail needs to clear.
  const [pendingKey, setPendingKey] = useState(null);
  const [error, setError] = useState(null);
  const latestSeqRef = useRef({ key: null, seq: 0 });
  const wasDisconnectedRef = useRef(false);

  const events = store.key === key ? store.events : [];
  const loading = key != null && pendingKey === key;

  const seqFor = useCallback((k) => (latestSeqRef.current.key === k ? latestSeqRef.current.seq : 0), []);
  const bumpSeq = useCallback((k, seq) => {
    if (typeof seq !== "number") return;
    if (latestSeqRef.current.key !== k) latestSeqRef.current = { key: k, seq: 0 };
    if (seq > latestSeqRef.current.seq) latestSeqRef.current.seq = seq;
  }, []);

  const mergeInto = useCallback((k, incoming) => {
    setStore((prev) => ({ key: k, events: merge(prev.key === k ? prev.events : [], incoming) }));
  }, []);

  const fetchSince = useCallback(
    async ({ replayed = false } = {}) => {
      if (!key) return;
      try {
        const res = await getJobEvents(type, jobId, { since: seqFor(key) });
        const fetched = (res.data.events || []).map((e) => ({ ...e, replayed: replayed || undefined }));
        bumpSeq(key, res.data.latestSeq);
        mergeInto(key, fetched);
        setError(null);
      } catch (err) {
        setError(err.friendlyMessage || "Failed to load job events");
      } finally {
        setPendingKey((prev) => (prev === key ? null : prev));
      }
    },
    [key, type, jobId, seqFor, bumpSeq, mergeInto]
  );

  // Initial load whenever the job changes. The microtask inside fetchSince
  // (not the effect body itself) is what flips `pendingKey`, so this stays
  // outside the "setState synchronously in an effect" pattern.
  useEffect(() => {
    if (!key) return;
    Promise.resolve().then(() => {
      setPendingKey(key);
      fetchSince();
    });
  }, [key, fetchSince]);

  // Live events for this job, plus gap re-read after a reconnect.
  useEffect(() => {
    if (!key) return;
    const id = String(jobId);
    const unsubscribes = LIVE_SOURCES.map(([eventType, subscribe]) =>
      subscribe((data) => {
        if (String(data?.jobId) !== id) return;
        const { seq, ...rest } = data;
        const hasSeq = typeof seq === "number";
        bumpSeq(key, seq);
        mergeInto(key, [{ seq: hasSeq ? seq : null, type: eventType, data: rest, at: new Date().toISOString(), live: true }]);
      })
    );
    unsubscribes.push(
      onDisconnect(() => {
        wasDisconnectedRef.current = true;
      }),
      onConnect(() => {
        if (!wasDisconnectedRef.current) return;
        wasDisconnectedRef.current = false;
        fetchSince({ replayed: true });
      })
    );
    return () => unsubscribes.forEach((off) => off());
  }, [key, jobId, fetchSince, bumpSeq, mergeInto]);

  return { events, loading, error, refetch: fetchSince };
}

export default useJobEvents;
