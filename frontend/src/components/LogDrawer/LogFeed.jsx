import { memo } from "react";
import { cn } from "../ui/cn";
import { LEVEL_META, formatTime } from "./logEntries";

const FALLBACK_META = { text: "text-neutral-600 dark:text-neutral-400" };

/** The scrolling list of log lines. Memoized so drawer open/close and drags don't re-render it. */
export const LogFeed = memo(function LogFeed({ entries, scrollRef, onScroll }) {
  return (
    <div ref={scrollRef} onScroll={onScroll} className="min-h-0 flex-1 overflow-y-auto bg-neutral-100 dark:bg-neutral-950">
      {entries.length === 0 ? (
        <div className="flex h-full items-center justify-center text-sm text-text-tertiary">Waiting for activity...</div>
      ) : (
        entries.map((entry) => {
          const meta = LEVEL_META[entry.level] || { ...FALLBACK_META, label: entry.level };
          return (
            <div key={entry._key} className="flex items-baseline gap-2 border-b border-border-light px-3 py-1 font-mono text-[11.5px] leading-5">
              <span className="shrink-0 text-neutral-400 dark:text-neutral-500">{formatTime(entry.timestamp)}</span>
              <span className={cn("shrink-0 w-[52px] font-semibold uppercase tracking-wide", meta.text)}>{meta.label}</span>
              <span className="min-w-0 flex-1 whitespace-pre-wrap break-words text-neutral-700 dark:text-neutral-200">{entry.message}</span>
            </div>
          );
        })
      )}
    </div>
  );
});
