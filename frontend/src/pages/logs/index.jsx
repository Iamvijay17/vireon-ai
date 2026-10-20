import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Trash2, ChevronDown, ArrowDownToLine, Pause, Play } from "lucide-react";
import { getRecentLogs } from "../../services/api";
import { connect, onServerLog } from "../../services/socket";
import { loadSettings, saveSettings } from "../../shared/settingsStorage";
import { PageHeader } from "../../components";
import ConnectionIndicator from "../../components/ConnectionIndicator";
import { Card } from "../../components/ui/Card";
import { Button } from "../../components/ui/Button";
import { Switch } from "../../components/ui/Switch";
import { SearchInput } from "../../components/ui/SearchInput";
import { SegmentedControl } from "../../components/ui/SegmentedControl";
import { cn } from "../../components/ui/cn";

const MAX_ENTRIES = 1000;
const SCROLL_BOTTOM_THRESHOLD = 48;

// Mirrors backend/src/services/LoggerService.js customLevels - only levels
// that are actually broadcast over the 'serverLog' socket event (http/debug
// are dropped server-side as too noisy for a pipeline-activity console).
// Colours come from the theme's status tokens so they follow light and dark.
const LEVELS = [
  { value: "error", label: "Error", dot: "bg-danger-500", text: "text-danger-600 dark:text-danger-500" },
  { value: "warn", label: "Warn", dot: "bg-warning-500", text: "text-warning-600 dark:text-warning-500" },
  { value: "info", label: "Info", dot: "bg-info-500", text: "text-info-600 dark:text-info-500" },
  { value: "llm", label: "LLM", dot: "bg-accent-fg", text: "text-accent-fg" },
  { value: "tts", label: "TTS", dot: "bg-success-500", text: "text-success-600 dark:text-success-500" },
  { value: "render", label: "Render", dot: "bg-text-secondary", text: "text-text-secondary" },
  { value: "upload", label: "Upload", dot: "bg-warning-600", text: "text-warning-600 dark:text-warning-500" },
];

const LEVEL_META = Object.fromEntries(LEVELS.map((l) => [l.value, l]));

const TIME_OPTIONS = [
  { value: "24h", label: "24h" },
  { value: "12h", label: "12h" },
];

const formatTime = (timestamp, hour12 = false) => {
  if (!timestamp) return "--:--:--";
  const d = new Date(timestamp);
  if (Number.isNaN(d.getTime())) return String(timestamp).slice(11, 19) || "--:--:--";
  return d.toLocaleTimeString(undefined, { hour12 });
};

// Every entry needs a stable key even though the backend doesn't assign
// ids - logs arrive fast enough that timestamp+index collisions are the norm.
let seq = 0;
const withKey = (entry) => ({ ...entry, _key: `${Date.now()}-${seq++}` });

const LogRow = ({ entry, expanded, onToggle, hour12 }) => {
  const meta = LEVEL_META[entry.level] || { label: entry.level, dot: "bg-text-tertiary", text: "text-text-tertiary" };
  const hasMeta = entry.meta && Object.keys(entry.meta).length > 0;

  return (
    <div className="border-b border-border-light px-4 py-1.5 font-mono text-[12.5px] leading-5 hover:bg-surface-hover">
      <div
        className={cn("flex flex-wrap items-start gap-x-3 sm:flex-nowrap", hasMeta && "cursor-pointer")}
        onClick={hasMeta ? onToggle : undefined}
      >
        <span className="tabular shrink-0 text-text-tertiary">{formatTime(entry.timestamp, hour12)}</span>
        <span className={cn("w-[60px] shrink-0 font-semibold uppercase tracking-wide sm:w-[74px]", meta.text)}>{meta.label}</span>
        <span className="order-last min-w-0 basis-full whitespace-pre-wrap break-words text-text-primary sm:order-none sm:flex-1 sm:basis-0">{entry.message}</span>
        {hasMeta && <ChevronDown className={cn("ml-auto size-3.5 shrink-0 self-center text-text-tertiary transition-transform sm:ml-0", expanded && "rotate-180")} />}
      </div>
      {hasMeta && expanded && (
        <pre className="mt-1.5 overflow-x-auto rounded-md border border-border-light bg-surface-active p-2 text-[11.5px] text-text-secondary sm:ml-[104px]">
          {JSON.stringify(entry.meta, null, 2)}
        </pre>
      )}
    </div>
  );
};

/**
 * Live Logs: the backend's activity stream (LLM, TTS, render, upload) as it
 * happens. Filter by level or text, pause to read, expand a line for its data.
 */
const LiveLogs = () => {
  const [entries, setEntries] = useState([]);
  const [activeLevels, setActiveLevels] = useState(() => new Set(LEVELS.map((l) => l.value)));
  const [query, setQuery] = useState("");
  const [autoScroll, setAutoScroll] = useState(true);
  const [paused, setPaused] = useState(false);
  const [expandedKey, setExpandedKey] = useState(null);
  const [pendingCount, setPendingCount] = useState(0);
  const [hour12, setHour12] = useState(() => loadSettings().timeFormat === "12h");

  const scrollRef = useRef(null);
  const pausedBufferRef = useRef([]);

  useEffect(() => {
    connect();
    getRecentLogs(300)
      .then((res) => setEntries((res.data.logs || []).map(withKey)))
      .catch(() => {});
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
      return entry.message?.toLowerCase().includes(q) || (entry.meta && JSON.stringify(entry.meta).toLowerCase().includes(q));
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

  const setTimeFormat = (value) => {
    setHour12(value === "12h");
    saveSettings({ ...loadSettings(), timeFormat: value });
  };

  return (
    <div>
      <PageHeader
        title="Live Logs"
        description="Real-time backend activity: language model, narration, rendering and uploads."
        meta={<ConnectionIndicator />}
      />

      <Card className="flex h-[calc(100dvh-13rem)] min-h-[420px] flex-col overflow-hidden">
        <div className="flex flex-wrap items-center gap-2 border-b border-border-light px-3 py-2.5">
          <SearchInput value={query} onChange={setQuery} placeholder="Search logs" className="w-full sm:w-60" />

          <div className="flex flex-wrap items-center gap-1" role="group" aria-label="Filter by level">
            {LEVELS.map((level) => {
              const active = activeLevels.has(level.value);
              return (
                <button
                  key={level.value}
                  type="button"
                  aria-pressed={active}
                  onClick={() => toggleLevel(level.value)}
                  className={cn(
                    "inline-flex cursor-pointer items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors",
                    active ? "border-border-strong bg-surface-active text-text-primary" : "border-border text-text-tertiary hover:bg-surface-hover"
                  )}
                >
                  <span className={cn("size-1.5 rounded-full", active ? level.dot : "bg-text-tertiary")} />
                  {level.label}
                </button>
              );
            })}
          </div>

          <div className="flex items-center gap-2 sm:ml-auto">
            <SegmentedControl aria-label="Time format" size="sm" value={hour12 ? "12h" : "24h"} onChange={setTimeFormat} options={TIME_OPTIONS} />
            <label className="flex items-center gap-2 text-xs text-text-secondary">
              Auto-scroll
              <Switch aria-label="Auto-scroll" checked={autoScroll} onChange={setAutoScroll} />
            </label>
            <Button variant="secondary" size="sm" icon={paused ? <Play className="size-3.5" /> : <Pause className="size-3.5" />} onClick={togglePause}>
              {paused ? `Resume${pendingCount ? ` (${pendingCount})` : ""}` : "Pause"}
            </Button>
            <Button variant="ghost" size="sm" icon={<Trash2 className="size-3.5" />} onClick={() => setEntries([])}>
              Clear
            </Button>
          </div>
        </div>

        <div className="relative flex min-h-0 flex-1 flex-col">
          <div ref={scrollRef} onScroll={handleScroll} role="log" aria-live="off" className="min-h-0 flex-1 overflow-y-auto bg-bg">
            {filtered.length === 0 ? (
              <div className="flex h-full items-center justify-center text-sm text-text-tertiary">
                {entries.length === 0 ? "Waiting for activity…" : "No logs match the current filters"}
              </div>
            ) : (
              filtered.map((entry) => (
                <LogRow
                  key={entry._key}
                  entry={entry}
                  expanded={expandedKey === entry._key}
                  onToggle={() => setExpandedKey((k) => (k === entry._key ? null : entry._key))}
                  hour12={hour12}
                />
              ))
            )}
          </div>

          {!autoScroll && (
            <button
              type="button"
              onClick={jumpToLatest}
              className="absolute bottom-4 right-4 flex cursor-pointer items-center gap-1.5 rounded-full bg-accent px-3 py-1.5 text-xs font-medium text-white shadow-lg hover:bg-accent-hover"
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
