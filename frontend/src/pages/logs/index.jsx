import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Trash2, ChevronDown, ArrowDownToLine, Search } from "lucide-react";
import { getRecentLogs } from "../../services/api";
import { connect, onServerLog, onConnect, onDisconnect, isConnected } from "../../services/socket";
import { Card } from "../../components/ui/Card";
import { Button } from "../../components/ui/Button";
import { Input } from "../../components/ui/Input";
import { Switch } from "../../components/ui/Switch";
import { Badge } from "../../components/ui/Badge";
import { cn } from "../../components/ui/cn";

const MAX_ENTRIES = 1000;
const SCROLL_BOTTOM_THRESHOLD = 48;

// Mirrors backend/src/services/LoggerService.js customLevels - only levels
// that are actually broadcast over the 'serverLog' socket event (http/debug
// are dropped server-side as too noisy for a pipeline-activity console).
const LEVELS = [
  { value: "error", label: "Error", dot: "bg-red-500 dark:bg-red-400", text: "text-red-600 dark:text-red-400" },
  { value: "warn", label: "Warn", dot: "bg-amber-500 dark:bg-amber-400", text: "text-amber-600 dark:text-amber-400" },
  { value: "info", label: "Info", dot: "bg-sky-500 dark:bg-sky-400", text: "text-sky-600 dark:text-sky-400" },
  { value: "lmstudio", label: "LM Studio", dot: "bg-violet-500 dark:bg-violet-400", text: "text-violet-600 dark:text-violet-400" },
  { value: "tts", label: "TTS", dot: "bg-emerald-500 dark:bg-emerald-400", text: "text-emerald-600 dark:text-emerald-400" },
  { value: "render", label: "Render", dot: "bg-slate-500 dark:bg-slate-400", text: "text-slate-600 dark:text-slate-400" },
  { value: "upload", label: "Upload", dot: "bg-orange-500 dark:bg-orange-400", text: "text-orange-600 dark:text-orange-400" },
];

const LEVEL_META = Object.fromEntries(LEVELS.map((l) => [l.value, l]));

const formatTime = (timestamp) => {
  if (!timestamp) return "--:--:--";
  const d = new Date(timestamp);
  if (Number.isNaN(d.getTime())) return String(timestamp).slice(11, 19) || "--:--:--";
  return d.toLocaleTimeString(undefined, { hour12: false });
};

// Every entry needs a stable key even though the backend doesn't assign
// ids - logs arrive fast enough that timestamp+index collisions are the norm.
let seq = 0;
const withKey = (entry) => ({ ...entry, _key: `${Date.now()}-${seq++}` });

const LogRow = ({ entry, expanded, onToggle }) => {
  const meta = LEVEL_META[entry.level] || { label: entry.level, dot: "bg-neutral-400", text: "text-neutral-600 dark:text-neutral-400" };
  const hasMeta = entry.meta && Object.keys(entry.meta).length > 0;

  return (
    <div className="border-b border-border-light px-4 py-1.5 font-mono text-[12.5px] leading-5 hover:bg-surface-hover">
      <div
        className={cn("flex items-start gap-3", hasMeta && "cursor-pointer")}
        onClick={hasMeta ? onToggle : undefined}
      >
        <span className="shrink-0 text-neutral-400 dark:text-neutral-500">{formatTime(entry.timestamp)}</span>
        <span className={cn("shrink-0 w-[74px] font-semibold uppercase tracking-wide", meta.text)}>
          {meta.label}
        </span>
        <span className="min-w-0 flex-1 whitespace-pre-wrap break-words text-neutral-700 dark:text-neutral-200">{entry.message}</span>
        {hasMeta && (
          <ChevronDown className={cn("size-3.5 shrink-0 text-neutral-400 dark:text-neutral-500 transition-transform", expanded && "rotate-180")} />
        )}
      </div>
      {hasMeta && expanded && (
        <pre className="mt-1.5 ml-[104px] overflow-x-auto rounded-md bg-surface-active p-2 text-[11.5px] text-neutral-600 dark:text-neutral-400">
          {JSON.stringify(entry.meta, null, 2)}
        </pre>
      )}
    </div>
  );
};

const LiveLogs = () => {
  const [entries, setEntries] = useState([]);
  const [connected, setConnected] = useState(isConnected());
  const [activeLevels, setActiveLevels] = useState(() => new Set(LEVELS.map((l) => l.value)));
  const [query, setQuery] = useState("");
  const [autoScroll, setAutoScroll] = useState(true);
  const [paused, setPaused] = useState(false);
  const [expandedKey, setExpandedKey] = useState(null);
  const [pendingCount, setPendingCount] = useState(0);

  const scrollRef = useRef(null);
  const pausedBufferRef = useRef([]);

  useEffect(() => {
    connect();
    getRecentLogs(300)
      .then((res) => setEntries((res.data.logs || []).map(withKey)))
      .catch(() => {});
  }, []);

  useEffect(() => {
    const unsubConnect = onConnect(() => setConnected(true));
    const unsubDisconnect = onDisconnect(() => setConnected(false));
    return () => {
      unsubConnect();
      unsubDisconnect();
    };
  }, []);

  useEffect(() => {
    const unsub = onServerLog((data) => {
      if (paused) {
        pausedBufferRef.current.push(data);
        setPendingCount(pausedBufferRef.current.length);
        return;
      }
      setEntries((prev) => {
        const next = [...prev, withKey(data)];
        return next.length > MAX_ENTRIES ? next.slice(next.length - MAX_ENTRIES) : next;
      });
    });
    return unsub;
  }, [paused]);

  const togglePause = useCallback(() => {
    setPaused((prev) => {
      if (prev) {
        // Resuming: flush anything buffered while paused.
        setEntries((cur) => {
          const merged = [...cur, ...pausedBufferRef.current.map(withKey)];
          pausedBufferRef.current = [];
          return merged.length > MAX_ENTRIES ? merged.slice(merged.length - MAX_ENTRIES) : merged;
        });
        setPendingCount(0);
      }
      return !prev;
    });
  }, []);

  const toggleLevel = useCallback((value) => {
    setActiveLevels((prev) => {
      const next = new Set(prev);
      if (next.has(value)) next.delete(value);
      else next.add(value);
      return next;
    });
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return entries.filter((entry) => {
      if (!activeLevels.has(entry.level)) return false;
      if (!q) return true;
      return (
        entry.message?.toLowerCase().includes(q) ||
        (entry.meta && JSON.stringify(entry.meta).toLowerCase().includes(q))
      );
    });
  }, [entries, activeLevels, query]);

  useEffect(() => {
    if (!autoScroll) return;
    const el = scrollRef.current;
    if (!el) return;
    // Set synchronously (no requestAnimationFrame) - by the time this passive
    // effect runs, React has already committed the new rows to the DOM, and
    // reading/writing scrollTop forces layout on demand. rAF would be throttled
    // or fully suspended while this tab is backgrounded, silently breaking
    // autoscroll for a page users commonly leave open in a background tab.
    el.scrollTop = el.scrollHeight;
  }, [filtered.length, autoScroll]);

  const handleScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < SCROLL_BOTTOM_THRESHOLD;
    setAutoScroll(atBottom);
  };

  const jumpToLatest = () => {
    setAutoScroll(true);
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  };

  const clearLogs = () => setEntries([]);

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-text-primary">Live Logs</h1>
          <p className="mt-1 text-sm text-text-secondary">
            Real-time stream of backend activity - LM Studio, TTS, rendering, and uploads.
          </p>
        </div>
        <Badge variant={connected ? "success" : "danger"} dot>
          {connected ? "Live" : "Offline"}
        </Badge>
      </div>

      <Card className="flex h-[calc(100vh-16rem)] min-h-[380px] animate-slide-up flex-col overflow-hidden">
        <div className="flex flex-wrap items-center gap-3 border-b border-border-light px-4 py-3">
          <div className="flex flex-wrap items-center gap-1.5">
            {LEVELS.map((level) => {
              const active = activeLevels.has(level.value);
              return (
                <button
                  key={level.value}
                  type="button"
                  onClick={() => toggleLevel(level.value)}
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors",
                    active
                      ? "border-transparent bg-accent-subtle text-accent"
                      : "border-border text-text-tertiary hover:bg-surface-hover"
                  )}
                >
                  <span className={cn("size-1.5 rounded-full", level.dot)} />
                  {level.label}
                </button>
              );
            })}
          </div>

          <Input
            icon={<Search className="size-4" />}
            placeholder="Search logs..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="ml-auto w-56"
          />

          <div className="flex items-center gap-2 text-xs text-text-secondary">
            <span>Auto-scroll</span>
            <Switch checked={autoScroll} onChange={setAutoScroll} />
          </div>

          <Button variant="secondary" size="sm" onClick={togglePause}>
            {paused ? `Resume${pendingCount ? ` (${pendingCount})` : ""}` : "Pause"}
          </Button>

          <Button variant="ghost" size="sm" icon={<Trash2 className="size-4" />} onClick={clearLogs}>
            Clear
          </Button>
        </div>

        <div className="relative flex min-h-0 flex-1 flex-col">
          <div
            ref={scrollRef}
            onScroll={handleScroll}
            className="min-h-0 flex-1 overflow-y-auto bg-neutral-100 dark:bg-neutral-950"
          >
            {filtered.length === 0 ? (
              <div className="flex h-full items-center justify-center text-sm text-text-tertiary">
                {entries.length === 0 ? "Waiting for activity..." : "No logs match the current filters"}
              </div>
            ) : (
              filtered.map((entry) => (
                <LogRow
                  key={entry._key}
                  entry={entry}
                  expanded={expandedKey === entry._key}
                  onToggle={() => setExpandedKey((k) => (k === entry._key ? null : entry._key))}
                />
              ))
            )}
          </div>

          {!autoScroll && (
            <button
              type="button"
              onClick={jumpToLatest}
              className="absolute bottom-4 right-4 flex items-center gap-1.5 rounded-full bg-accent px-3 py-1.5 text-xs font-medium text-white shadow-lg shadow-black/20 hover:bg-accent-hover"
            >
              <ArrowDownToLine className="size-3.5" />
              Jump to latest
            </button>
          )}
        </div>
      </Card>
    </div>
  );
};

export default LiveLogs;
