import { useEffect, useRef, useState, useCallback } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import { Terminal, Expand, ArrowDownToLine, GripVertical, Pin, PinOff, X } from "lucide-react";
import { cn } from "../ui/cn";
import { useLogStream } from "./useLogStream";
import { useEdgeDock } from "./useEdgeDock";
import { LogFeed } from "./LogFeed";

const SCROLL_BOTTOM_THRESHOLD = 40;

const LogDrawer = () => {
  const [open, setOpen] = useState(false);
  // When pinned the drawer stays open until the user closes it, even after the
  // mouse leaves (hover-only mode collapses on mouse-out instead).
  const [pinned, setPinned] = useState(false);
  const [autoScroll, setAutoScroll] = useState(true);
  const entries = useLogStream(open);
  const { edge, offset, dragHandlers, wasDrag } = useEdgeDock();

  const scrollRef = useRef(null);
  const navigate = useNavigate();

  // Auto-scroll to the newest line whenever a new one arrives (only while the
  // user hasn't scrolled back up).
  useEffect(() => {
    if (!autoScroll) return;
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [entries, autoScroll]);

  const close = () => {
    setOpen(false);
    setPinned(false);
  };

  // Clicking the handle toggles the panel, unless that interaction was a drag.
  // Collapsing via the handle also clears the pin so hover can reopen it.
  const handleToggle = () => {
    if (wasDrag()) return;
    if (open) close();
    else setOpen(true);
  };

  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    setAutoScroll(el.scrollHeight - el.scrollTop - el.clientHeight < SCROLL_BOTTOM_THRESHOLD);
  }, []);

  const jumpToLatest = () => {
    setAutoScroll(true);
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  };

  // Edge-aware geometry derived from the current dock (right or left only).
  const isRight = edge === "right";
  // Clamped at render: a position saved on a tall desktop window would
  // otherwise leave the handle off-screen (or on the navbar) on a short one.
  const containerStyle = { top: `clamp(70px, ${offset}px, calc(100dvh - 70px))`, [edge]: 0 };
  const panelTransform = `translate(${open ? "0px" : isRight ? "calc(100% + 8px)" : "calc(-100% - 8px)"}, -50%)`;
  const panelAnchor = `top-0 ${isRight ? "right-0" : "left-0"}`;
  const handlePosition = `top-0 ${isRight ? "right-0" : "left-0"} -translate-y-1/2`;
  // Mirror the handle/panel shape: rounded corners face inward on each side.
  const handleShape = isRight ? "rounded-l-xl" : "rounded-r-xl";
  const panelShape = isRight ? "rounded-l-2xl" : "rounded-r-2xl";

  return createPortal(
    <div
      className="fixed z-40"
      style={containerStyle}
      // Hovering always opens; `pinned` only decides whether mouse-leave closes it.
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => {
        if (!pinned) setOpen(false);
      }}
    >
      {/* Sliding panel (extends inward from the docked edge) */}
      <div
        className={cn("absolute transition-transform duration-300 ease-out", panelAnchor)}
        style={{ transform: panelTransform }}
        aria-hidden={!open}
      >
        <div className={cn("flex h-[72vh] w-[min(400px,calc(100vw-3rem))] flex-col overflow-hidden border border-border bg-surface shadow-xl shadow-black/10", panelShape)}>
          {/* Header */}
          <div className="flex items-center gap-1.5 border-b border-border-light px-3 py-2">
            <span
              className="mr-0.5 flex h-9 w-2.5 cursor-grab items-center justify-center rounded active:cursor-grabbing touch-none select-none text-text-tertiary hover:text-text-secondary"
              {...dragHandlers}
            >
              <GripVertical className="size-4" />
            </span>
            <Terminal className="size-4 text-accent" />
            <span className="text-sm font-semibold text-text-primary">Live Logs</span>
            <span className="ml-1 flex size-1.5 rounded-full bg-emerald-500" title="Streaming" />

            <div className="ml-auto flex items-center gap-0.5">
              <button
                type="button"
                onClick={() => navigate("/logs")}
                title="Open full logs page"
                className="cursor-pointer flex items-center gap-1 rounded-md px-2 py-1 text-xs text-text-secondary transition-colors hover:bg-surface-hover hover:text-text-primary"
              >
                <Expand className="size-3.5" />
                Full view
              </button>
              <button
                type="button"
                onClick={() => {
                  setOpen(true);
                  setPinned((p) => !p);
                }}
                title={pinned ? "Unpin (collapse on mouse-out)" : "Pin open until closed"}
                className={cn(
                  "cursor-pointer flex size-7 items-center justify-center rounded-md transition-colors hover:bg-surface-hover",
                  pinned ? "text-accent" : "text-text-secondary hover:text-text-primary"
                )}
              >
                {pinned ? <Pin className="size-3.5" /> : <PinOff className="size-3.5" />}
              </button>
              <button
                type="button"
                onClick={close}
                title="Close"
                className="cursor-pointer flex size-7 items-center justify-center rounded-md text-text-secondary transition-colors hover:bg-surface-hover hover:text-text-primary"
              >
                <X className="size-4" />
              </button>
            </div>
          </div>

          <LogFeed entries={entries} scrollRef={scrollRef} onScroll={handleScroll} />

          {/* Jump-to-bottom affordance */}
          {!autoScroll && (
            <button
              type="button"
              onClick={jumpToLatest}
              className="cursor-pointer absolute bottom-4 right-4 flex items-center gap-1.5 rounded-full bg-accent px-3 py-1.5 text-xs font-medium text-white shadow-lg shadow-black/20 hover:bg-accent-hover"
            >
              <ArrowDownToLine className="size-3.5" />
              New logs
            </button>
          )}
        </div>
      </div>

      {/* Handle - draggable to dock on the right / left edge */}
      <button
        type="button"
        {...dragHandlers}
        onClick={handleToggle}
        title="Drag left/right to switch side · Click to toggle"
        className={cn(
          "absolute z-10 flex flex-col items-center gap-1 cursor-grab active:cursor-grabbing touch-none select-none border border-border bg-surface text-text-secondary shadow-lg shadow-black/5 transition-colors hover:bg-surface-hover hover:text-accent",
          handlePosition,
          handleShape,
          "px-1.5 py-3"
        )}
      >
        <GripVertical className="size-4" />
        <Terminal className="size-4" />
        <span
          className="text-[10px] font-semibold tracking-widest uppercase"
          style={{
            writingMode: "vertical-rl",
            // On the left edge, flip the text so it reads bottom-to-top and
            // mirrors the right-side tab cleanly instead of looking reversed.
            transform: isRight ? undefined : "rotate(180deg)",
          }}
        >
          Logs
        </span>
      </button>
    </div>,
    document.body
  );
};

export default LogDrawer;
