import {
  Video, CheckCircle2, XCircle, AlertTriangle, GraduationCap, Hourglass, Timer, Mic2, Clock,
  TrendingUp, TrendingDown, Minus,
} from "lucide-react";
import { Card } from "../../components/ui/Card";
import { formatDuration, formatPercent, trendDelta, successRateDelta } from "./format";

// Solid, circular icon badges (not soft gradient squares) to match a
// real-dashboard look - each KPI card's icon reads as a colored dot.
const toneCls = {
  accent: "bg-accent-500/15 text-accent-600 dark:text-accent-400",
  warning: "bg-warning-500/15 text-warning-600 dark:text-warning-500",
  success: "bg-success-500/15 text-success-600 dark:text-success-500",
  danger: "bg-danger-500/15 text-danger-600 dark:text-danger-500",
  info: "bg-info-500/15 text-info-600 dark:text-info-500",
};

// Pill-shaped delta badge (solid tint background, not just colored text) -
// reads more like a real dashboard's "+15.5%" chip than plain inline text.
// `invert` flips which sign reads as "good" (e.g. Failed Jobs, where a
// decrease is the good outcome) without touching the displayed number.
const DeltaBadge = ({ delta, suffix = "%", invert = false }) => {
  if (!delta || delta.pct === 0) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-neutral-500/10 px-1.5 py-0.5 text-[11px] font-medium text-text-tertiary">
        <Minus className="size-3" /> flat
      </span>
    );
  }
  const up = delta.pct > 0;
  const good = invert ? !up : up;
  return (
    <span
      className={`inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[11px] font-medium ${
        good
          ? "bg-success-500/10 text-success-600 dark:text-success-500"
          : "bg-danger-500/10 text-danger-600 dark:text-danger-500"
      }`}
    >
      {up ? <TrendingUp className="size-3" /> : <TrendingDown className="size-3" />}
      {up ? "+" : ""}
      {delta.pct}
      {suffix}
    </span>
  );
};

/**
 * The headline KPI row. Individual panels, not a fused strip: soft shadow,
 * solid circular icon badge, bold value, pill delta badge + caption.
 */
export function KpiTiles({ summary, trend }) {
  const tiles = [
    {
      title: "Total Videos",
      value: summary.totalVideos ?? 0,
      icon: Video,
      tone: "accent",
      delta: trendDelta(trend, "jobsCreated"),
      caption: `${summary.totalVideoJobs ?? 0} jobs · ${summary.totalCourseVideos ?? 0} course videos`,
    },
    {
      title: "Success Rate",
      value: formatPercent(summary.jobSuccessRate),
      icon: CheckCircle2,
      tone: "success",
      delta: successRateDelta(trend),
      deltaSuffix: "pt",
      caption: "vs last period",
    },
    {
      title: "Failed Jobs",
      value: summary.failedVideoJobs ?? 0,
      icon: XCircle,
      tone: "danger",
      delta: trendDelta(trend, "jobsFailed"),
      invertDelta: true,
      caption: "vs last period",
    },
    {
      title: "Failure Rate",
      value: formatPercent(summary.jobFailureRate),
      icon: AlertTriangle,
      tone: "danger",
      caption: "of resolved jobs",
    },
    {
      title: "Course Completion",
      value: formatPercent(summary.courseCompletionRate),
      icon: GraduationCap,
      tone: "info",
      delta: trendDelta(trend, "courseVideosRendered"),
      caption: `${summary.completedCourses ?? 0} of ${summary.totalCourses ?? 0} courses`,
    },
  ];

  return (
    <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
      {tiles.map((s, i) => (
        <Card key={s.title} className="animate-slide-up rounded-2xl p-4 shadow-sm" style={{ "--stagger-index": i }}>
          <div className="flex items-start justify-between">
            <p className="text-xs font-medium text-text-tertiary">{s.title}</p>
            <div className={`flex size-8 shrink-0 items-center justify-center rounded-full ${toneCls[s.tone]}`}>
              <s.icon className="size-4" />
            </div>
          </div>
          <p className="mt-3 text-[26px] font-bold leading-none tracking-tight text-text-primary">{s.value}</p>
          <div className="mt-2.5 flex items-center gap-1.5">
            {s.delta && <DeltaBadge delta={s.delta} suffix={s.deltaSuffix || "%"} invert={s.invertDelta} />}
            <span className="truncate text-[11px] text-text-tertiary">{s.caption}</span>
          </div>
        </Card>
      ))}
    </div>
  );
}

/** Average time per pipeline phase, as a compact icon list. */
export function ProcessingTimeCard({ summary }) {
  const stats = [
    { title: "Avg. Generation Time", value: formatDuration(summary.avgGenerationTimeMs), icon: Hourglass, tone: "info" },
    { title: "Avg. Render Time", value: formatDuration(summary.avgRenderTimeMs), icon: Timer, tone: "warning" },
    { title: "Avg. TTS Time", value: formatDuration(summary.avgTtsTimeMs), icon: Mic2, tone: "accent" },
    { title: "Queue Wait Time", value: formatDuration(summary.avgQueueWaitMs), icon: Clock, tone: "success" },
  ];

  return (
    <Card className="animate-slide-up rounded-2xl p-4 shadow-sm" style={{ "--stagger-index": 5 }}>
      <p className="text-xs font-medium text-text-secondary">Processing Time</p>
      <div className="mt-3 space-y-3">
        {stats.map((s) => (
          <div key={s.title} className="flex items-center gap-2.5">
            <div className={`flex size-8 shrink-0 items-center justify-center rounded-full ${toneCls[s.tone]}`}>
              <s.icon className="size-4" />
            </div>
            <div className="min-w-0">
              <p className="truncate text-[11px] text-text-tertiary">{s.title}</p>
              <p className="text-base font-semibold tracking-tight text-text-primary">{s.value}</p>
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}
