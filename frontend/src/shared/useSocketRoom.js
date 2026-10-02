import { useEffect, useRef, useSyncExternalStore } from "react";
import {
  connect,
  getConnectionStatus,
  subscribeToConnectionStatus,
} from "../services/socket";

/**
 * The socket-room lifecycle every live page repeats: connect, join a room,
 * subscribe to events, expose connection status for the Live/Offline
 * badge, then leave the room and unsubscribe on unmount.
 *
 * Extracted from three near-identical copies (useJobSocket,
 * useVideoSocket, useCourseSocket) that differed only in which room they
 * joined, which events they listened to, and what they re-fetched after a
 * reconnect. Those are the three parameters below; the rest was duplicated
 * boilerplate - including a listener teardown that two of the three only
 * performed on id change, never on unmount.
 *
 * @param {string} roomId          falsy disables the whole effect
 * @param {object} handlers
 * @param {(id) => void} handlers.join
 * @param {(id) => void} handlers.leave
 * @param {(id) => Array<() => void>} handlers.subscribe
 *        Registers listeners and returns their unsubscribe functions.
 * @param {(id) => void} [handlers.onReconnect]
 *        Rooms are not remembered across a reconnect, so this runs after
 *        the room is rejoined - the place to refetch whatever may have
 *        changed while the socket was down.
 * @returns {"connected"|"reconnecting"|"disconnected"}
 */
export function useSocketRoom(roomId, { join, leave, subscribe, onReconnect } = {}) {
  // Read straight from the socket rather than mirroring it into state via
  // an effect: the connection is an external store, and this is exactly
  // what useSyncExternalStore is for. It also means the status is correct
  // on the very first render, with no initial-sync effect.
  const socketStatus = useSyncExternalStore(subscribeToConnectionStatus, getConnectionStatus);

  // Kept in a ref so the subscribe effect depends only on roomId. Listing
  // the caller's fetch callbacks as dependencies (what the previous
  // versions did) tore down and rebuilt every listener whenever one of
  // them changed identity. Handlers are read through the ref at call time,
  // so they are never stale.
  const handlersRef = useRef({ join, leave, subscribe, onReconnect });

  // Declared before the subscribe effect so it runs first on mount, and
  // assigned in an effect rather than during render (refs must not be
  // written while rendering).
  useEffect(() => {
    handlersRef.current = { join, leave, subscribe, onReconnect };
  });

  useEffect(() => {
    if (!roomId) return undefined;

    const unsubscribes = [];
    connect();
    handlersRef.current.join?.(roomId);
    unsubscribes.push(...(handlersRef.current.subscribe?.(roomId) || []));

    // Rooms are not restored automatically after a drop - rejoin, then let
    // the caller resync whatever it missed.
    const offReconnect = subscribeToConnectionStatus(() => {
      if (getConnectionStatus() !== "connected") return;
      handlersRef.current.join?.(roomId);
      handlersRef.current.onReconnect?.(roomId);
    });

    return () => {
      offReconnect();
      handlersRef.current.leave?.(roomId);
      unsubscribes.forEach((unsubscribe) => unsubscribe?.());
    };
  }, [roomId]);

  return socketStatus;
}

export default useSocketRoom;
