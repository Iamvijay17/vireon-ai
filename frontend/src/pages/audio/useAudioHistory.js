import { useState, useEffect, useCallback, useRef } from "react";
import { getAudioGenerations, deleteAudioGeneration } from "../../services/api";
import {
  connect,
  joinJobRoom,
  leaveJobRoom,
  onAudioStudioTurnReady,
  onAudioStudioChunkReady,
  onAudioStudioCompleted,
  onAudioStudioFailed,
} from "../../services/socket";
import { toast } from "../../components/ui/toastBus";
import { confirmDialog } from "../../components/ui/confirmBus";

// Fallback poll while a generation is in flight, purely as a safety net in
// case a socket event gets dropped (tab backgrounded, brief reconnect) -
// the socket events below are the primary progress mechanism, this is not.
const SAFETY_POLL_MS = 15000;

/**
 * The Audio Studio's generation history: loads it, patches the in-flight
 * generation live from socket events, and runs a generate request with
 * that tracking wired up (`runTracked`).
 */
export function useAudioHistory() {
  const [history, setHistory] = useState([]);
  // Spinner only until the first load: the safety polls and post-generate
  // refreshes update the list in place instead of flashing it away.
  const [historyLoaded, setHistoryLoaded] = useState(false);
  const [historyError, setHistoryError] = useState(null);
  const [deletingId, setDeletingId] = useState(null);

  // Id of the AudioGeneration record currently streaming progress over the
  // socket - only one generation can be in flight at a time (the Generate
  // button is disabled while generating), so a single ref is enough.
  const trackedIdRef = useRef(null);

  // State is only set in the promise callbacks, so the mount effect below
  // can call this without cascading renders. Resolves to the items, or null.
  const fetchHistory = useCallback(
    () =>
      getAudioGenerations(1, 50)
        .then((res) => {
          const items = res.data?.items || [];
          setHistory(items);
          setHistoryError(null);
          return items;
        })
        .catch((err) => {
          // Deliberately don't clear `history` here - a transient failure (the
          // backend restarting, a network blip) would otherwise render exactly
          // like "no generations yet" and make already-generated audio look
          // like it vanished, when it's still safely in the DB. Show an
          // explicit retry instead of silently looking empty.
          setHistoryError(err.friendlyMessage || "Failed to load audio history");
          return null;
        })
        .finally(() => setHistoryLoaded(true)),
    []
  );

  useEffect(() => {
    fetchHistory();
  }, [fetchHistory]);

  // Live progress: join the in-flight generation's own room (any entity id
  // works here, not just video jobs - see SocketService.emitToJob) and patch
  // that one history item's turns/chunks in place as they arrive, instead of
  // waiting for the whole (possibly multi-minute) request to resolve.
  useEffect(() => {
    connect();

    const patchPieces = (id, key, index, piece) => {
      if (id !== trackedIdRef.current) return;
      setHistory((prev) =>
        prev.map((h) => {
          if (h._id !== id) return h;
          const pieces = [...(h[key] || [])];
          pieces[index] = piece;
          return { ...h, [key]: pieces };
        })
      );
    };

    const unsubTurn = onAudioStudioTurnReady(({ id, turnIndex, turn }) => patchPieces(id, "turns", turnIndex, turn));
    const unsubChunk = onAudioStudioChunkReady(({ id, chunkIndex, chunk }) => patchPieces(id, "chunks", chunkIndex, chunk));
    const unsubCompleted = onAudioStudioCompleted(({ id, audio }) => {
      if (id !== trackedIdRef.current) return;
      setHistory((prev) => [audio, ...prev.filter((h) => h._id !== id)]);
    });
    const unsubFailed = onAudioStudioFailed(({ id, error }) => {
      if (id !== trackedIdRef.current) return;
      setHistory((prev) => prev.map((h) => (h._id === id ? { ...h, status: "FAILED", error } : h)));
    });

    return () => {
      unsubTurn();
      unsubChunk();
      unsubCompleted();
      unsubFailed();
    };
  }, []);

  // Kicks off tracking for a new generation once its record shows up in
  // history: the create-then-generate request is one long synchronous call,
  // so the client only learns the record's id via this side-channel refetch
  // (the same 700ms delay the old polling-only version used to first surface
  // "Pending"), not from the request itself, which doesn't resolve until
  // everything is done.
  const trackNewGeneration = (previousIds) => {
    const timer = setTimeout(async () => {
      const items = await fetchHistory();
      const created = items?.find((h) => !previousIds.has(h._id) && h.status === "PENDING");
      if (created) {
        trackedIdRef.current = created._id;
        joinJobRoom(created._id);
      }
    }, 700);
    return () => clearTimeout(timer);
  };

  const stopTracking = () => {
    if (trackedIdRef.current) {
      leaveJobRoom(trackedIdRef.current);
      trackedIdRef.current = null;
    }
  };

  /**
   * Runs `start()` (a generate request resolving to `{ data: { audio } }`)
   * with live tracking and the safety poll, then puts the finished record at
   * the top of the history. Rejects with the request's error.
   */
  const runTracked = async (start) => {
    const previousIds = new Set(history.map((h) => h._id));
    let cancelDiscovery = () => {};
    try {
      const genPromise = start();
      cancelDiscovery = trackNewGeneration(previousIds);
      const safetyPoll = setInterval(() => fetchHistory(), SAFETY_POLL_MS);
      const res = await genPromise.finally(() => clearInterval(safetyPoll));
      setHistory((prev) => [res.data.audio, ...prev.filter((h) => h._id !== res.data.audio._id)]);
      setHistoryError(null);
      return res;
    } finally {
      cancelDiscovery();
      stopTracking();
    }
  };

  const handleDelete = async (item) => {
    const ok = await confirmDialog({
      title: "Delete this audio?",
      content: "This removes the generated file(s) and its history entry. This can't be undone.",
      confirmText: "Delete",
      danger: true,
    });
    if (!ok) return;
    try {
      setDeletingId(item._id);
      await deleteAudioGeneration(item._id);
      setHistory((prev) => prev.filter((h) => h._id !== item._id));
    } catch (err) {
      toast.error(err.friendlyMessage || "Failed to delete audio");
    } finally {
      setDeletingId(null);
    }
  };

  return {
    history,
    historyLoading: !historyLoaded,
    historyError,
    fetchHistory,
    deletingId,
    handleDelete,
    runTracked,
  };
}
