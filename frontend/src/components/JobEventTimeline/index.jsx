import { useMemo } from "react";
import { PlusCircle, Activity, AudioLines, CheckCircle2, XCircle, RotateCcw, Radio, Zap } from "lucide-react";
import { cn } from "../ui/cn";
import { Badge } from "../ui/Badge";
import { Tooltip } from "../ui/Tooltip";
import { classifyStatus } from "../../lib/statusTone";

const humanize = (s) =>
  (s || "")
    .toLowerCase()
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());

const fmtTime = (iso) => {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", second: "2-digit", hour12: true }).toLowerCase();
};

const fmtDuration = (ms) => {
  if (ms == null || ms < 0) return null;
  if (ms < 1000) return `${Math.round(ms)}ms`;
  const s = ms / 1000;
  if (s < 60) return `${s.toFixed(s < 10 ? 1 : 0)}s`;
  const m = Math.floor(s / 60);
  const rem = Math.round(s % 60);
  if (m < 60) return rem ? `${m}m ${rem}s` : `${m}m`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m`;
};

const TONE_DOT = {
  neutral: "bg-text-tertiary",
  accent: "bg-accent",
  success: "bg-success-500",
  warning: "bg-warning-500",
  error: "bg-danger-500",
};

/**
 * Turn a raw JobEvent into what the row shows. Each socket event type has a
 * fixed payload shape (see backend socketService/jobEvents.js), so this is
 * the one place that knows how to read them.
 */
function describe(event) {
  const d = event.data || {};
  switch (event.type) {
    case "jobCreated":
      return { Icon: PlusCircle, tone: "neutral", title: "Job created", detail: d.topic, cacheHit: false };
    case "jobProgress": {
      const tone = classifyStatus(d.status) === "error" ? "error" : "accent";
      const parts = [];
      if (d.currentScene != null) parts.push(`scene ${d.currentScene}`);
      if (d.progress != null) parts.push(`${d.progress}%`);
      return {
        Icon: Activity,
        tone,
        title: humanize(d.currentStep || d.status) || "Progress",
        detail: parts.join(" · ") || null,
        status: d.status,
        cacheHit: false,
      };
    }
    case "sceneAudioReady": {
      const parts = [];
      if (d.audio?.duration != null) parts.push(`${Number(d.audio.duration).toFixed(1)}s`);
      return {
        Icon: d.audio?.fromCache ? Zap : AudioLines,
        tone: "accent",
        title: `Scene ${d.sceneNumber} audio ready`,
        detail: parts.join(" · ") || null,
        cacheHit: !!d.audio?.fromCache,
      };
    }
    case "jobCompleted":
      return { Icon: CheckCircle2, tone: "success", title: "Completed", detail: d.videoUrl ? "Video uploaded" : null, cacheHit: false };
    case "jobFailed":
      return { Icon: XCircle, tone: "error", title: "Failed", detail: d.error || null, emphasizeDetail: true, cacheHit: false };
    default:
      return { Icon: Activity, tone: "neutral", title: humanize(event.type), detail: null, cacheHit: false };
  }
}

/**
 * Chronological view of a job's durable event stream (JobEvent), newest
 * first. Each row shows the gap since the previous event so slow steps
 * stand out, and flags events that were replayed after a reconnect.
 *
 * props: events (oldest-first, as returned by useJobEvents), limit?, className?
 */
export const JobEventTimeline = ({ events = [], limit, className, emptyText = "No events recorded yet" }) => {
  const rows = useMemo(() => {
    const withGaps = events.map((event, i) => {
      const prev = events[i - 1];
      const gap = prev?.at && event.at ? new Date(event.at) - new Date(prev.at) : null;
      return { event, gap, ...describe(event) };
    });
    const newestFirst = withGaps.reverse();
    return limit ? newestFirst.slice(0, limit) : newestFirst;
  }, [events, limit]);

  if (rows.length === 0) {
    return <p className="text-[13px] text-text-tertiary">{emptyText}</p>;
  }

  return (
    <ol className={cn("relative", className)}>
      {rows.map(({ event, gap, Icon, tone, title, detail, emphasizeDetail, cacheHit }, i) => {
        const key = event.seq != null ? `seq-${event.seq}` : `unseq-${event.at}-${i}`;
        return (
          <li key={key} className="relative flex gap-3 pb-4 last:pb-0">
            {i < rows.length - 1 && <span className="absolute left-[5px] top-3 h-full w-px bg-border-light" />}
            <span className={cn("relative mt-1.5 size-2.5 shrink-0 rounded-full ring-4 ring-surface", TONE_DOT[tone])} />
            <div className="min-w-0 flex-1">
              <div className="flex items-start justify-between gap-2">
                <p className="flex min-w-0 items-center gap-1.5 text-[13px] text-text-primary">
                  <Icon className="size-3.5 shrink-0 text-text-tertiary" />
                  <span className="truncate">{title}</span>
                  {cacheHit && (
                    <Tooltip content="Served from cache - not regenerated">
                      <Badge variant="success" icon={<Zap className="size-3" />}>cached</Badge>
                    </Tooltip>
                  )}
                  {event.replayed && (
                    <Tooltip content="Arrived after a reconnect - replayed from the server's event log">
                      <Badge variant="warning" icon={<RotateCcw className="size-3" />}>replayed</Badge>
                    </Tooltip>
                  )}
                  {event.live && !event.replayed && i === 0 && (
                    <Radio className="size-3 shrink-0 text-accent" aria-label="live" />
                  )}
                </p>
                <span className="flex shrink-0 items-center gap-2 text-xs text-text-tertiary tabular-nums">
                  {gap != null && gap > 0 && <span className="text-text-secondary">+{fmtDuration(gap)}</span>}
                  {event.seq != null && (
                    <Tooltip content={`seq ${event.seq}`}>
                      <span className="font-mono opacity-60">#{event.seq}</span>
                    </Tooltip>
                  )}
                </span>
              </div>
              {detail && (
                <p className={cn("mt-0.5 text-xs", emphasizeDetail ? "text-danger-500" : "text-text-secondary")}>{detail}</p>
              )}
              <p className="mt-0.5 text-xs text-text-tertiary">{fmtTime(event.at)}</p>
            </div>
          </li>
        );
      })}
    </ol>
  );
};

export default JobEventTimeline;
