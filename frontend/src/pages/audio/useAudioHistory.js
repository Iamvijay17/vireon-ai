import { useState, useEffect, useCallback, useRef } from "react";
import { getAudioGenerations, deleteAudioGeneration } from "../../services/api";
import {
  connect,
  joinJobRoom,
  leaveJobRoom,
  onAudioStudioStarted,
  onAudioStudioTurnReady,
  onAudioStudioChunkReady,
  onAudioStudioCompleted,
  onAudioStudioFailed,
} from "../../services/socket";
import { toast } from "../../components/ui/toastBus";
import { confirmDialog } from "../../components/ui/confirmBus";

const isInFlight = (item) => item.status === "QUEUED" || item.status === "PENDING";

// Fallback poll while a generation is in flight, purely as a safety net in
// case a socket event gets dropped (tab backgrounded, brief reconnect) -
// the socket events below are the primary progress mechanism, this is not.
const SAFETY_POLL_MS = 15000;

/**
 * The Audio Studio's generation history: loads it, patches every queued or
 * running generation live from socket events, and submits new generate
 * requests (`submit`). The server runs generations one at a time, so any
 * number can be queued at once.
 */
export function useAudioHistory() {
  const [history, setHistory] = useState([]);
  // Spinner only until the first load: the safety polls and post-generate
  // refreshes update the list in place instead of flashing it away.
  const [historyLoaded, setHistoryLoaded] = useState(false);
  const [historyError, setHistoryError] = useState(null);
  const [deletingId, setDeletingId] = useState(null);

  // Ids of the in-flight AudioGeneration records whose socket rooms we've
  // joined - kept in step with `history` by the effect below.
  const joinedIdsRef = useRef(new Set());

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

  // Live progress: every queued/running generation gets its own socket room
  // (any entity id works here, not just video jobs - see SocketService.emitToJob).
  // Deriving the joined set from `history` means a generation is followed
  // from the moment it's submitted, and again after a page reload.
  const inFlightKey = history.filter(isInFlight).map((h) => h._id).join(",");
  useEffect(() => {
    const wanted = new Set(inFlightKey ? inFlightKey.split(",") : []);
    const joined = joinedIdsRef.current;
    let joinedNew = false;
    for (const id of wanted) {
      if (!joined.has(id)) {
        joined.add(id);
        joinJobRoom(id);
        joinedNew = true;
      }
    }
    for (const id of [...joined]) {
      if (!wanted.has(id)) {
        joined.delete(id);
        leaveJobRoom(id);
      }
    }
    // Events fired between submitting and joining the room are missed, so
    // pull the current state once after joining.
    if (!joinedNew) return undefined;
    const timer = setTimeout(() => fetchHistory(), 1000);
    return () => clearTimeout(timer);
  }, [inFlightKey, fetchHistory]);

  useEffect(
    () => () => {
      for (const id of joinedIdsRef.current) leaveJobRoom(id);
      joinedIdsRef.current.clear();
    },
    []
  );

  useEffect(() => {
    connect();

    const patchItem = (id, patch) =>
      setHistory((prev) => prev.map((h) => (h._id === id ? { ...h, ...patch } : h)));

    const patchPieces = (id, key, index, piece) =>
      setHistory((prev) =>
        prev.map((h) => {
          if (h._id !== id) return h;
          const pieces = [...(h[key] || [])];
          pieces[index] = piece;
          return { ...h, [key]: pieces };
        })
      );

    const unsubStarted = onAudioStudioStarted(({ id, startedAt }) => patchItem(id, { status: "PENDING", startedAt }));
    const unsubTurn = onAudioStudioTurnReady(({ id, turnIndex, turn }) => patchPieces(id, "turns", turnIndex, turn));
    const unsubChunk = onAudioStudioChunkReady(({ id, chunkIndex, chunk }) => patchPieces(id, "chunks", chunkIndex, chunk));
    const unsubCompleted = onAudioStudioCompleted(({ id, audio }) => {
      setHistory((prev) =>
        prev.some((h) => h._id === id) ? prev.map((h) => (h._id === id ? audio : h)) : [audio, ...prev]
      );
      toast.success("Audio generated");
    });
    const unsubFailed = onAudioStudioFailed(({ id, error }) => {
      patchItem(id, { status: "FAILED", error });
      toast.error(error || "Audio generation failed");
    });

    return () => {
      unsubStarted();
      unsubTurn();
      unsubChunk();
      unsubCompleted();
      unsubFailed();
    };
  }, []);

  // Safety net only while something is queued or running (see SAFETY_POLL_MS).
  const hasInFlight = inFlightKey !== "";
  useEffect(() => {
    if (!hasInFlight) return undefined;
    const timer = setInterval(() => fetchHistory(), SAFETY_POLL_MS);
    return () => clearInterval(timer);
  }, [hasInFlight, fetchHistory]);

  /**
   * Submits a generate request (resolving to `{ data: { audio } }`). The
   * server answers right away with the QUEUED record, which goes to the top
   * of the history; the socket effects above take it from there. Rejects
   * with the request's error.
   */
  const submit = async (start) => {
    const res = await start();
    const audio = res.data.audio;
    setHistory((prev) => [audio, ...prev.filter((h) => h._id !== audio._id)]);
    setHistoryError(null);
    return res;
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
    submit,
  };
}
