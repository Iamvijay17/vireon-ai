import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import {
  Terminal,
  Expand,
  ArrowDownToLine,
  GripVertical,
  Pin,
  PinOff,
  X,
} from "lucide-react";
import { getRecentLogs } from "../../services/api";
import { connect, onServerLog } from "../../services/socket";
import { cn } from "../ui/cn";

const MAX_ENTRIES = 200;
const SCROLL_BOTTOM_THRESHOLD = 40;
const POS_STORAGE_KEY = "vireon-log-drawer-pos";

// Mirrors backend/src/services/LoggerService.js customLevels - only levels that
// are broadcast over the 'serverLog' socket event (http/debug are dropped
// server-side as too noisy for a pipeline-activity console).
const LEVEL_META = {
  error: { label: "Error", text: "text-red-600 dark:text-red-400" },
  warn: { label: "Warn", text: "text-amber-600 dark:text-amber-400" },
  info: { label: "Info", text: "text-sky-600 dark:text-sky-400" },
  lmstudio: { label: "LM Studio", text: "text-violet-600 dark:text-violet-400" },
  tts: { label: "TTS", text: "text-emerald-600 dark:text-emerald-400" },
  render: { label: "Render", text: "text-slate-600 dark:text-slate-400" },
  upload: { label: "Upload", text: "text-orange-600 dark:text-orange-400" },
};

const formatTime = (timestamp) => {
  if (!timestamp) return "--:--:--";
  const d = new Date(timestamp);
  if (Number.isNaN(d.getTime())) return String(timestamp).slice(11, 19) || "--:--:--";
  return d.toLocaleTimeString(undefined, { hour12: false });
};

// Every entry needs a stable key even though the backend doesn't assign ids.
let seq = 0;
const withKey = (entry) => ({ ...entry, _key: `${Date.now()}-${seq++}` });

const LogDrawer = () => {
  const [open, setOpen] = useState(false);
  // When pinned the drawer stays open until the user closes it, even after the
  // mouse leaves (hover-only mode collapses on mouse-out instead).
  const [pinned, setPinned] = useState(false);
  const [entries, setEntries] = useState([]);
  const [autoScroll, setAutoScroll] = useState(true);
  // Dock position. The drawer only sits on a screen edge (right or left) - it
  // never floats in the middle. `edge` is which side it's docked to; `offset`
  // is the vertical center position along that edge in px.
  const [edge, setEdge] = useState("right");
  const [offset, setOffset] = useState(() => {
    if (typeof window === "undefined") return 400;
    try {
      const saved = JSON.parse(localStorage.getItem(POS_STORAGE_KEY) || "null");
      if (saved && (saved.edge === "right" || saved.edge === "left") && Number.isFinite(saved.offset)) {
        return saved.offset;
      }
    } catch {
      /* ignore storage errors */
    }
    return Math.round(window.innerHeight / 2);
  });

  const scrollRef = useRef(null);
  const dragRef = useRef(null); // { startX, startY, edge, offset, moved } while dragging
  const navigate = useNavigate();

  // Connect and hydrate with recent logs once. The socket service exposes a
  // shared singleton, so connecting here is safe even on the logs page itself.
  useEffect(() => {
    connect();
    getRecentLogs(200)
      .then((res) => setEntries((res.data.logs || []).map(withKey)))
      .catch(() => {});
  }, []);

  // Stream new log lines live.
  useEffect(() => {
    const unsub = onServerLog((data) => {
      setEntries((prev) => {
        const next = [...prev, withKey(data)];
        return next.length > MAX_ENTRIES ? next.slice(next.length - MAX_ENTRIES) : next;
      });
    });
    return unsub;
  }, []);

  // Auto-scroll to the newest line whenever a new one arrives (only while the
  // user hasn't scrolled back up).
  useEffect(() => {
    if (!autoScroll) return;
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [entries, autoScroll]);

  // Persist the docked edge + position so the drawer stays where the user put it.
  useEffect(() => {
    try {
      localStorage.setItem(POS_STORAGE_KEY, JSON.stringify({ edge, offset: Math.round(offset) }));
    } catch {
      /* ignore storage errors */
    }
  }, [edge, offset]);

  // ─── Edge-constrained drag (snaps to right / left edges only) ──────────────
  const handlePointerDown = (e) => {
    dragRef.current = { startX: e.clientX, startY: e.clientY, edge, offset, moved: false };
    e.currentTarget.setPointerCapture?.(e.pointerId);
  };

  const handlePointerMove = (e) => {
    if (!dragRef.current) return;
    const W = window.innerWidth;
    const H = window.innerHeight;
    const px = e.clientX;
    const py = e.clientY;
    if (Math.abs(px - dragRef.current.startX) > 3 || Math.abs(py - dragRef.current.startY) > 3) {
      dragRef.current.moved = true;
    }

    const minY = 70;
    const maxY = H - 70;
    let nextEdge = dragRef.current.edge;
    let nextOffset = dragRef.current.offset;

    // Switch sides when the pointer crosses the screen's horizontal middle.
    if (dragRef.current.edge === "right" && px < W / 2) {
      nextEdge = "left";
    } else if (dragRef.current.edge === "left" && px >= W / 2) {
      nextEdge = "right";
    }
    // Stay docked on the current side edge, following the pointer vertically.
    nextOffset = Math.min(Math.max(py, minY), maxY);

    setEdge(nextEdge);
    setOffset(nextOffset);
  };

  const handlePointerEnd = () => {
    dragRef.current = null;
  };

  // Clicking the handle toggles the panel, unless that interaction was a drag.
  const handleToggle = () => {
    if (dragRef.current?.moved) return;
    setOpen((prev) => {
      const next = !prev;
      // Collapsing via the handle also clears the pin so hover can reopen it.
      if (!next) setPinned(false);
      return next;
    });
  };

  // Hovering always opens; `pinned` only decides whether mouse-leave closes it.
  const handleOpen = useCallback(() => setOpen(true), []);

  const close = useCallback(() => {
    setOpen(false);
    setPinned(false);
  }, []);

  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < SCROLL_BOTTOM_THRESHOLD;
    setAutoScroll(atBottom);
  }, []);

  const jumpToLatest = useCallback(() => {
    setAutoScroll(true);
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, []);


const scrollable = useMemo(
    () => (
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="min-h-0 flex-1 overflow-y-auto bg-neutral-100 dark:bg-neutral-950"
      >
        {entries.length === 0 ? (
          <div className="flex h-full items-center justify-center text-sm text-text-tertiary">
            Waiting for activity...
          </div>
        ) : (
          entries.map((entry) => {
            const meta = LEVEL_META[entry.level] || { label: entry.level, text: "text-neutral-600 dark:text-neutral-400" };
            return (
              <div
                key={entry._key}
                className="flex items-baseline gap-2 border-b border-border-light px-3 py-1 font-mono text-[11.5px] leading-5"
              >
                <span className="shrink-0 text-neutral-400 dark:text-neutral-500">
                  {formatTime(entry.timestamp)}
                </span>
                <span className={cn("shrink-0 w-[52px] font-semibold uppercase tracking-wide", meta.text)}>
                  {meta.label}
                </span>
                <span className="min-w-0 flex-1 whitespace-pre-wrap break-words text-neutral-700 dark:text-neutral-200">
                  {entry.message}
                </span>
              </div>
            );
          })
        )}
      </div>
    ),
    [entries, handleScroll]
  );

  // Edge-aware geometry derived from the current dock (right or left only).
  const isRight = edge === "right";
  const containerStyle = { top: offset, [edge]: 0 };
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
      onMouseEnter={handleOpen}
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
        <div className={cn("flex h-[72vh] w-[400px] flex-col overflow-hidden border border-border bg-surface shadow-xl shadow-black/10", panelShape)}>
          {/* Header */}
          <div className="flex items-center gap-1.5 border-b border-border-light px-3 py-2">
            <span
              className="mr-0.5 flex h-9 w-2.5 cursor-grab items-center justify-center rounded active:cursor-grabbing touch-none select-none text-text-tertiary hover:text-text-secondary"
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerEnd}
              onPointerCancel={handlePointerEnd}
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
                className="flex items-center gap-1 rounded-md px-2 py-1 text-xs text-text-secondary transition-colors hover:bg-surface-hover hover:text-text-primary"
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
                  "flex size-7 items-center justify-center rounded-md transition-colors hover:bg-surface-hover",
                  pinned ? "text-accent" : "text-text-secondary hover:text-text-primary"
                )}
              >
                {pinned ? <Pin className="size-3.5" /> : <PinOff className="size-3.5" />}
              </button>
              <button
                type="button"
                onClick={close}
                title="Close"
                className="flex size-7 items-center justify-center rounded-md text-text-secondary transition-colors hover:bg-surface-hover hover:text-text-primary"
              >
                <X className="size-4" />
              </button>
            </div>
          </div>
{/* Log feed */}
          {scrollable}

          {/* Jump-to-bottom affordance */}
          {!autoScroll && (
            <button
              type="button"
              onClick={jumpToLatest}
              className="absolute bottom-4 right-4 flex items-center gap-1.5 rounded-full bg-accent px-3 py-1.5 text-xs font-medium text-white shadow-lg shadow-black/20 hover:bg-accent-hover"
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
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerEnd}
        onPointerCancel={handlePointerEnd}
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