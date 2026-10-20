import { useSyncExternalStore } from "react";
import { getConnectionStatus, subscribeToConnectionStatus } from "../services/socket";

/**
 * The live socket's state: "connected" | "reconnecting" | "disconnected".
 * Read from the socket store itself, so it is right on the first render and
 * every page showing a Live badge agrees with every other.
 */
export const useSocketStatus = () => useSyncExternalStore(subscribeToConnectionStatus, getConnectionStatus);

export default useSocketStatus;
