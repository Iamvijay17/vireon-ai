import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, CalendarDays } from "lucide-react";
import { Card, CardHeader, CardBody } from "../../components/ui/Card";
import { Button } from "../../components/ui/Button";
import { Select } from "../../components/ui/Select";
import { cn } from "../../components/ui/cn";
import { ErrorState, EmptyState } from "../../components";
import { useSocialCalendar } from "./usePromotion";
import { PlatformTile, StatusBadge, SkeletonRows } from "./shared";
import { PostDetailModal } from "./PostDetailModal";
import { PLATFORMS, platformLabel, browserTimeZone, monthGrid, groupByDay, dayKey, formatInZone, statusMeta } from "./format";

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

const DOT = {
  SCHEDULED: "bg-info-500", COMPLETED: "bg-success-500", FAILED: "bg-danger-500", CANCELLED: "bg-text-tertiary",
  QUEUED: "bg-accent", RETRYING: "bg-warning-500", PROCESSING: "bg-accent", UPLOADING: "bg-accent", VALIDATING: "bg-accent",
};

/**
 * Month view of what is scheduled and what went out. Times are shown in this browser's time zone; each post
 * also names the time zone it was scheduled in. Click a day to list its posts; click a post for the full
 * record, where it can be edited, rescheduled or cancelled.
 */
export const CalendarPanel = () => {
  const tz = useMemo(() => browserTimeZone(), []);
  const today = new Date();
  const [cursor, setCursor] = useState({ year: today.getFullYear(), month: today.getMonth() });
  const [platform, setPlatform] = useState("");
  const [selectedDay, setSelectedDay] = useState(dayKey(today, tz));
  const [openId, setOpenId] = useState(null);

  // Fetch a day either side of the visible grid so posts near the edges are not lost to zone offsets.
  const range = useMemo(() => ({
    from: new Date(Date.UTC(cursor.year, cursor.month, -7)).toISOString(),
    to: new Date(Date.UTC(cursor.year, cursor.month + 1, 8)).toISOString(),
    ...(platform ? { platform } : {}),
  }), [cursor, platform]);
  const { data, loading, error, refetch } = useSocialCalendar(range);

  const weeks = useMemo(() => monthGrid(cursor.year, cursor.month), [cursor]);
  const byDay = useMemo(() => groupByDay(data?.items || [], tz), [data, tz]);
  const monthLabel = new Date(Date.UTC(cursor.year, cursor.month, 1)).toLocaleDateString(undefined, { month: "long", year: "numeric", timeZone: "UTC" });
  const move = (delta) => setCursor((c) => { const d = new Date(Date.UTC(c.year, c.month + delta, 1)); return { year: d.getUTCFullYear(), month: d.getUTCMonth() }; });
  const todayKey = dayKey(today, tz);
  const dayItems = byDay.get(selectedDay) || [];

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
      <Card>
        <CardHeader
          title={monthLabel}
          subtitle={`Times shown in ${tz.replace(/_/g, " ")}`}
          extra={(
            <>
              <Select className="w-40" value={platform} onChange={setPlatform} options={[{ value: "", label: "All platforms" }, ...PLATFORMS.map((p) => ({ value: p, label: platformLabel(p) }))]} />
              <Button size="sm" variant="secondary" iconOnly icon={<ChevronLeft className="size-4" />} onClick={() => move(-1)} aria-label="Previous month" />
              <Button size="sm" variant="secondary" onClick={() => { setCursor({ year: today.getFullYear(), month: today.getMonth() }); setSelectedDay(todayKey); }}>Today</Button>
              <Button size="sm" variant="secondary" iconOnly icon={<ChevronRight className="size-4" />} onClick={() => move(1)} aria-label="Next month" />
            </>
          )}
        />
        <CardBody>
          {error && <ErrorState message="Could not load the calendar" onRetry={refetch} />}
          {loading ? <SkeletonRows rows={4} /> : (
            <div role="grid" aria-label={monthLabel}>
              <div className="grid grid-cols-7 border-b border-border-light pb-1.5 text-center text-[11px] font-semibold uppercase tracking-wide text-text-tertiary">
                {WEEKDAYS.map((d) => <div key={d}>{d}</div>)}
              </div>
              {weeks.map((week) => (
                <div key={week[0].key} className="grid grid-cols-7" role="row">
                  {week.map((cell) => {
                    const items = byDay.get(cell.key) || [];
                    const selected = cell.key === selectedDay;
                    return (
                      <button
                        key={cell.key} type="button" role="gridcell" aria-selected={selected} onClick={() => setSelectedDay(cell.key)}
                        aria-label={`${cell.key}${items.length ? `, ${items.length} post${items.length === 1 ? "" : "s"}` : ""}`}
                        className={cn(
                          "min-h-16 cursor-pointer border-b border-r border-border-light p-1.5 text-left transition-colors sm:min-h-20",
                          cell.inMonth ? "bg-surface" : "bg-surface-hover/40 text-text-tertiary", selected && "ring-2 ring-inset ring-accent"
                        )}
                      >
                        <span className={cn("inline-flex size-6 items-center justify-center rounded-full text-xs", cell.key === todayKey ? "bg-accent font-bold text-white" : "text-text-secondary")}>{cell.day}</span>
                        <div className="mt-1 flex flex-wrap gap-1">
                          {items.slice(0, 6).map((i) => <span key={i.postId} className={cn("size-2 rounded-full", DOT[i.status] || "bg-text-tertiary")} title={`${platformLabel(i.platform)} · ${statusMeta(i.status).label}`} />)}
                          {items.length > 6 && <span className="text-[10px] text-text-tertiary">+{items.length - 6}</span>}
                        </div>
                      </button>
                    );
                  })}
                </div>
              ))}
              <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-text-tertiary">
                {[["SCHEDULED", "Scheduled"], ["COMPLETED", "Published"], ["FAILED", "Failed"], ["RETRYING", "Retrying"], ["CANCELLED", "Cancelled"]].map(([k, l]) => (
                  <span key={k} className="inline-flex items-center gap-1.5"><span className={cn("size-2 rounded-full", DOT[k])} />{l}</span>
                ))}
              </div>
            </div>
          )}
        </CardBody>
      </Card>

      <Card>
        <CardHeader title={new Date(`${selectedDay}T12:00:00`).toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })} subtitle={`${dayItems.length} post${dayItems.length === 1 ? "" : "s"}`} />
        <CardBody className="space-y-2.5">
          {dayItems.length === 0 && <EmptyState description="Nothing scheduled or published on this day." />}
          {dayItems.map((i) => (
            <button key={i.postId} type="button" onClick={() => setOpenId(i.postId)} className="w-full cursor-pointer rounded-xl border border-border-light p-3 text-left transition-colors hover:border-border">
              <div className="flex flex-wrap items-center gap-2">
                <PlatformTile platform={i.platform} size="sm" />
                <span className="text-[13px] font-semibold text-text-primary">{formatInZone(i.at, tz, { dateStyle: undefined, timeStyle: "short" })}</span>
                <StatusBadge status={i.status} />
              </div>
              <p className="mt-1.5 line-clamp-2 text-[13px] text-text-secondary">{i.caption || "(no text)"}</p>
              <p className="mt-1 text-[11px] text-text-tertiary">{i.accountLabel}{i.timezone && i.timezone !== tz ? ` · scheduled in ${i.timezone.replace(/_/g, " ")}` : ""}</p>
              {i.error && <p className="mt-1 text-xs text-danger-500">{i.error.message}</p>}
            </button>
          ))}
          <p className="flex items-center gap-1.5 pt-1 text-[11px] text-text-tertiary"><CalendarDays className="size-3.5" />Open a post to edit, reschedule or cancel it.</p>
        </CardBody>
      </Card>

      {openId && <PostDetailModal postId={openId} onClose={() => setOpenId(null)} />}
    </div>
  );
};

export default CalendarPanel;
