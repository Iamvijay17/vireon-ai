import { cn } from "../ui/cn";
import { useSocketStatus } from "../../lib/useSocketStatus";

const STATES = {
  connected: { dot: "bg-success-500", label: "Live", title: "Receiving live updates from the server" },
  reconnecting: { dot: "bg-warning-500 animate-pulse", label: "Reconnecting", title: "Live updates paused - trying to reconnect. Data may be stale." },
  disconnected: { dot: "bg-danger-500", label: "Offline", title: "Not connected to the server. Data may be stale until it returns." },
};

/**
 * The live-updates state, in one consistent badge. When it is anything but
 * "Live", progress figures on the page can lag the server - this is how the
 * user knows not to trust a frozen bar.
 */
export const ConnectionIndicator = ({ status, showLabel = true, className }) => {
  const fromStore = useSocketStatus();
  const state = STATES[status || fromStore] || STATES.disconnected;
  return (
    <span
      title={state.title}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border border-border px-2 py-[3px] text-[11px] font-medium text-text-secondary",
        className
      )}
    >
      <span className={cn("size-1.5 rounded-full", state.dot)} aria-hidden="true" />
      {showLabel ? state.label : <span className="sr-only">{state.label}</span>}
    </span>
  );
};

export default ConnectionIndicator;
