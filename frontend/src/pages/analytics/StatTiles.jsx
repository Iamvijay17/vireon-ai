import {
  Video, CheckCircle2, XCircle, AlertTriangle, GraduationCap,
  TrendingUp, TrendingDown, Minus,
} from "lucide-react";
import { Card } from "../../components/ui/Card";
import { StatTile } from "../../components/ui/StatTile";
import { formatDuration, formatPercent, trendDelta, successRateDelta } from "./format";

// Pill-shaped delta badge (solid tint background, not just colored text) -
// reads more like a real dashboard's "+15.5%" chip than plain inline text.
// `invert` flips which sign reads as "good" (e.g. Failed Jobs, where a
// decrease is the good outcome) without touching the displayed number.
const DeltaBadge = ({ delta, suffix = "%", invert = false }) => {
  if (!delta || delta.pct === 0) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-surface-active px-1.5 py-0.5 text-[11px] font-medium text-text-tertiary">
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
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
      {tiles.map((s) => (
        <StatTile
          key={s.title}
          label={s.title}
          icon={s.icon}
          tone={s.tone}
          value={s.value}
          hint={
            <span className="inline-flex items-center gap-1.5">
              {s.delta && <DeltaBadge delta={s.delta} suffix={s.deltaSuffix || "%"} invert={s.invertDelta} />}
              <span>{s.caption}</span>
            </span>
          }
        />
      ))}
    </div>
  );
}

/** Average time per pipeline phase. A phase with no timed runs shows a dash. */
export function ProcessingTimeCard({ summary }) {
  const stats = [
    { title: "Generation (whole pipeline)", value: formatDuration(summary.avgGenerationTimeMs) },
    { title: "Render", value: formatDuration(summary.avgRenderTimeMs) },
    { title: "Narration (TTS)", value: formatDuration(summary.avgTtsTimeMs) },
    { title: "Queue wait", value: formatDuration(summary.avgQueueWaitMs) },
  ];

  return (
    <Card>
      <p className="border-b border-border-light px-4 py-3 text-sm font-semibold text-text-primary">Average processing time</p>
      <dl className="divide-y divide-border-light px-4">
        {stats.map((s) => (
          <div key={s.title} className="flex items-baseline justify-between gap-3 py-2.5">
            <dt className="text-xs text-text-tertiary">{s.title}</dt>
            <dd className="tabular text-sm font-semibold text-text-primary">{s.value}</dd>
          </div>
        ))}
      </dl>
    </Card>
  );
}
