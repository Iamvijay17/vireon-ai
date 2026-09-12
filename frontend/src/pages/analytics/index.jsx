import { useEffect, useState } from "react";
import {
  CheckCircle2,
  Timer,
  GraduationCap,
  RefreshCw,
  AlertTriangle,
  TrendingUp,
  TrendingDown,
  Minus,
  Activity,
  Layers,
  MonitorPlay,
  BookOpen,
  Mic2,
  Zap,
  HardDrive,
  XCircle,
  Clock,
  Video,
} from "lucide-react";
import { getAnalyticsOverview } from "../../services/api";
import { PageHeader, LoadingState, EmptyState } from "../../components";
import { Card, CardHeader } from "../../components/ui/Card";
import { Button } from "../../components/ui/Button";
import { Select } from "../../components/ui/Select";
import { Badge } from "../../components/ui/Badge";
import { TrendChart } from "../../components/charts/TrendChart";
import { RankedBarChart } from "../../components/charts/RankedBarChart";
import { StatusStackedBar } from "../../components/charts/StatusStackedBar";
import { StatusDonut } from "../../components/charts/StatusDonut";
import { Sparkline } from "../../components/charts/Sparkline";
import { toast } from "../../components/ui/toastBus";

const RANGE_OPTIONS = [
  { value: "7", label: "Last 7 days" },
  { value: "30", label: "Last 30 days" },
  { value: "90", label: "Last 90 days" },
];

const formatDuration = (ms) => {
  if (!ms && ms !== 0) return "—";
  const seconds = ms / 1000;
  if (seconds < 60) return `${seconds.toFixed(1)}s`;
  const minutes = ms / 60000;
  if (minutes < 60) return `${minutes.toFixed(1)}m`;
  return `${(minutes / 60).toFixed(1)}h`;
};

const formatPercent = (v) => (v === null || v === undefined ? "—" : `${v}%`);

const formatBytes = (bytes) => {
  if (!bytes) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  return `${(bytes / 1024 ** i).toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
};

// Splits a trend series in half and returns the % change of `key`'s sum
// (or, for `ratio`, the completed/created ratio) between the two halves -
// a lightweight period-over-period delta without needing a backend call.
const trendDelta = (trend, key) => {
  const n = trend?.length || 0;
  if (n < 4) return null;
  const mid = Math.floor(n / 2);
  const sum = (rows) => rows.reduce((s, r) => s + (r[key] || 0), 0);
  const prev = sum(trend.slice(0, mid));
  const curr = sum(trend.slice(mid));
  if (!prev && !curr) return null;
  if (!prev) return { pct: 100, curr, prev };
  return { pct: Math.round(((curr - prev) / prev) * 100), curr, prev };
};

const successRateSeries = (trend) =>
  (trend || []).map((d) => {
    const resolved = d.jobsCompleted + d.jobsFailed;
    return resolved ? Math.round((d.jobsCompleted / resolved) * 100) : 0;
  });

const DeltaBadge = ({ delta, suffix = "%" }) => {
  if (!delta || delta.pct === 0) {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-medium text-text-tertiary">
        <Minus className="size-3" /> flat
      </span>
    );
  }
  const positive = delta.pct > 0;
  return (
    <span
      className={`inline-flex items-center gap-1 text-xs font-medium ${
        positive ? "text-success-600 dark:text-success-500" : "text-danger-600 dark:text-danger-500"
      }`}
    >
      {positive ? <TrendingUp className="size-3" /> : <TrendingDown className="size-3" />}
      {positive ? "+" : ""}
      {delta.pct}
      {suffix}
    </span>
  );
};

const toneCls = {
  accent: "bg-gradient-to-br from-accent-500/20 to-accent-500/5 text-accent",
  warning: "bg-gradient-to-br from-warning-500/20 to-warning-500/5 text-warning-600 dark:text-warning-500",
  success: "bg-gradient-to-br from-success-500/20 to-success-500/5 text-success-600 dark:text-success-500",
  danger: "bg-gradient-to-br from-danger-500/20 to-danger-500/5 text-danger-600 dark:text-danger-500",
  info: "bg-gradient-to-br from-info-500/20 to-info-500/5 text-info-600 dark:text-info-500",
};

const toneLine = {
  accent: "var(--color-accent-500)",
  warning: "var(--color-warning-500)",
  success: "var(--color-success-500)",
  danger: "var(--color-danger-500)",
  info: "var(--color-info-500)",
};

const Analytics = () => {
  const [days, setDays] = useState("30");
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  const fetchData = async (range = days) => {
    try {
      setLoading(true);
      const res = await getAnalyticsOverview(Number(range));
      setData(res.data);
    } catch (err) {
      toast.error(err.friendlyMessage || "Failed to load analytics");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData(days);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [days]);

  if (loading && !data) {
    return (
      <div>
        <PageHeader title="Analytics" description="End-to-end metrics across your video and course pipelines." />
        <Card>
          <LoadingState label="Loading analytics..." />
        </Card>
      </div>
    );
  }

  const summary = data?.summary || {};
  const trend = data?.trend || [];
  const hasActivity = trend.some(
    (d) => d.jobsCreated || d.jobsCompleted || d.jobsFailed || d.courseVideosRendered
  );

  const topStats = [
    {
      title: "Total Videos",
      value: summary.totalVideos ?? 0,
      icon: Video,
      tone: "accent",
      spark: trend.map((d) => d.jobsCreated + d.courseVideosRendered),
      delta: trendDelta(trend, "jobsCreated"),
      caption: `${summary.totalVideoJobs ?? 0} jobs · ${summary.totalCourseVideos ?? 0} course videos`,
    },
    {
      title: "Job Success Rate",
      value: formatPercent(summary.jobSuccessRate),
      icon: CheckCircle2,
      tone: "success",
      spark: successRateSeries(trend),
      delta: (() => {
        const rates = successRateSeries(trend);
        const n = rates.length;
        if (n < 4) return null;
        const mid = Math.floor(n / 2);
        const avg = (arr) => arr.reduce((s, v) => s + v, 0) / (arr.length || 1);
        const prev = avg(rates.slice(0, mid));
        const curr = avg(rates.slice(mid));
        if (!prev) return null;
        return { pct: Math.round(curr - prev) };
      })(),
      deltaSuffix: "pt",
      caption: `${summary.completedVideoJobs ?? 0} completed`,
    },
    {
      title: "Failed Jobs",
      value: summary.failedVideoJobs ?? 0,
      icon: XCircle,
      tone: "danger",
      spark: trend.map((d) => d.jobsFailed),
      delta: trendDelta(trend, "jobsFailed"),
      invertDelta: true,
    },
    {
      title: "Course Completion",
      value: formatPercent(summary.courseCompletionRate),
      icon: GraduationCap,
      tone: "info",
      spark: trend.map((d) => d.courseVideosRendered),
      delta: trendDelta(trend, "courseVideosRendered"),
      caption: `${summary.completedCourses ?? 0} of ${summary.totalCourses ?? 0} courses done`,
    },
  ];

  const perfStats = [
    {
      title: "Avg. Render Time",
      value: formatDuration(summary.avgRenderTimeMs),
      icon: Timer,
      tone: "warning",
      caption: "Per completed video job",
    },
    {
      title: "Avg. TTS Time",
      value: formatDuration(summary.avgTtsTimeMs),
      icon: Mic2,
      tone: "accent",
      caption: "Per synthesis call",
    },
    {
      title: "Cache Hit Rate",
      value: formatPercent(summary.cacheHitRate),
      icon: Zap,
      tone: "success",
      caption: "Avatar clips & TTS audio reuse",
    },
    {
      title: "Storage Used",
      value: formatBytes(summary.totalStorageBytes),
      icon: HardDrive,
      tone: "info",
      caption: "Across all MinIO assets",
    },
  ];

  const trendSeries = [
    { key: "jobsCreated", label: "Jobs created", color: "var(--color-accent-500)" },
    { key: "jobsCompleted", label: "Jobs completed", color: "var(--color-success-500)" },
    { key: "jobsFailed", label: "Jobs failed", color: "var(--color-danger-500)" },
    { key: "courseVideosRendered", label: "Course videos rendered", color: "var(--color-info-500)" },
  ];

  return (
    <div>
      <PageHeader
        title="Analytics"
        description="End-to-end metrics across your video and course pipelines."
        extra={
          <>
            <Select value={days} onChange={setDays} options={RANGE_OPTIONS} className="w-40" />
            <Button variant="secondary" size="sm" loading={loading} onClick={() => fetchData(days)} icon={<RefreshCw className="size-4" />}>
              Refresh
            </Button>
          </>
        }
      />

      {/* Top stats */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {topStats.map((s, i) => (
          <Card
            key={s.title}
            hoverable
            className="animate-slide-up overflow-hidden p-5"
            style={{ "--stagger-index": i }}
          >
            <div className="flex items-start justify-between">
              <div className={`flex size-10 items-center justify-center rounded-[10px] ${toneCls[s.tone]}`}>
                <s.icon className="size-[19px]" />
              </div>
              {s.delta && <DeltaBadge delta={s.invertDelta ? { ...s.delta, pct: -s.delta.pct } : s.delta} suffix={s.deltaSuffix || "%"} />}
            </div>
            <p className="mt-3 text-xs font-medium text-text-tertiary">{s.title}</p>
            <p className="mt-1 text-2xl font-semibold tracking-tight text-text-primary">{s.value}</p>
            {s.caption && <p className="mt-0.5 truncate text-[11px] text-text-tertiary">{s.caption}</p>}
            <div className="-mx-1 -mb-1 mt-3">
              <Sparkline values={s.spark} color={toneLine[s.tone]} />
            </div>
          </Card>
        ))}
      </div>

      {/* Performance & cost stats */}
      <div className="mt-4 grid grid-cols-2 gap-4 lg:grid-cols-4">
        {perfStats.map((s, i) => (
          <Card
            key={s.title}
            hoverable
            className="animate-slide-up overflow-hidden p-5"
            style={{ "--stagger-index": i + 4 }}
          >
            <div className={`flex size-10 items-center justify-center rounded-[10px] ${toneCls[s.tone]}`}>
              <s.icon className="size-[19px]" />
            </div>
            <p className="mt-3 text-xs font-medium text-text-tertiary">{s.title}</p>
            <p className="mt-1 text-2xl font-semibold tracking-tight text-text-primary">{s.value}</p>
            <p className="mt-0.5 text-[11px] text-text-tertiary">{s.caption}</p>
          </Card>
        ))}
      </div>

      {/* Trend */}
      <Card className="mt-6 animate-slide-up" style={{ "--stagger-index": 8 }}>
        <CardHeader
          title={
            <span className="flex items-center gap-2">
              <Activity className="size-4 text-text-tertiary" /> Render Activity
            </span>
          }
          subtitle={`Jobs and course videos over the last ${days} days`}
        />
        <div className="p-5">
          {hasActivity ? (
            <TrendChart data={data.trend} series={trendSeries} />
          ) : (
            <EmptyState description="No render activity in this range yet." />
          )}
        </div>
      </Card>

      {/* Breakdown row 1: status donuts */}
      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card className="animate-slide-up" style={{ "--stagger-index": 9 }}>
          <CardHeader
            title={
              <span className="flex items-center gap-2">
                <Layers className="size-4 text-text-tertiary" /> Video Jobs by Status
              </span>
            }
          />
          <div className="p-5">
            <StatusDonut rows={data?.jobsByStatus || []} emptyLabel="No video jobs yet." />
          </div>
        </Card>

        <Card className="animate-slide-up" style={{ "--stagger-index": 10 }}>
          <CardHeader
            title={
              <span className="flex items-center gap-2">
                <BookOpen className="size-4 text-text-tertiary" /> Courses by Status
              </span>
            }
          />
          <div className="p-5">
            <StatusDonut rows={data?.coursesByStatus || []} emptyLabel="No courses yet." />
          </div>
        </Card>
      </div>

      {/* Breakdown row 2: ranked bars */}
      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card className="animate-slide-up" style={{ "--stagger-index": 11 }}>
          <CardHeader
            title={
              <span className="flex items-center gap-2">
                <MonitorPlay className="size-4 text-text-tertiary" /> Most-Used Templates
              </span>
            }
            subtitle="By video type"
          />
          <div className="p-5">
            <RankedBarChart rows={data?.topTemplates || []} color="var(--color-accent-500)" emptyLabel="No video jobs yet." />
          </div>
        </Card>

        <Card className="animate-slide-up" style={{ "--stagger-index": 12 }}>
          <CardHeader title="Video Jobs by Resolution" />
          <div className="p-5">
            <RankedBarChart rows={data?.jobsByResolution || []} color="var(--color-info-500)" emptyLabel="No video jobs yet." />
          </div>
        </Card>

        <Card className="animate-slide-up" style={{ "--stagger-index": 13 }}>
          <CardHeader
            title={
              <span className="flex items-center gap-2">
                <BookOpen className="size-4 text-text-tertiary" /> Courses by Category
              </span>
            }
          />
          <div className="p-5">
            <RankedBarChart rows={data?.coursesByCategory || []} color="var(--color-accent-500)" emptyLabel="No courses yet." />
          </div>
        </Card>
      </div>

      {/* Storage breakdown */}
      <Card className="mt-6 animate-slide-up" style={{ "--stagger-index": 14 }}>
        <CardHeader
          title={
            <span className="flex items-center gap-2">
              <HardDrive className="size-4 text-text-tertiary" /> Storage Usage by Category
            </span>
          }
          subtitle={`${formatBytes(summary.totalStorageBytes)} total across MinIO`}
        />
        <div className="p-5">
          {(data?.storageByCategory || []).length === 0 ? (
            <EmptyState description="No assets uploaded yet." />
          ) : (
            <RankedBarChart
              rows={(data.storageByCategory || []).map((r) => ({ label: r.label, count: r.bytes }))}
              color="var(--color-info-500)"
              formatValue={formatBytes}
            />
          )}
        </div>
      </Card>

      {/* Course pipeline health */}
      <Card className="mt-6 animate-slide-up" style={{ "--stagger-index": 15 }}>
        <CardHeader title="Course Video Pipeline" subtitle="Script, audio and render stage status across all lessons" />
        <div className="grid grid-cols-1 gap-6 p-5 md:grid-cols-3">
          <StatusStackedBar label="Script" rows={data?.courseVideoStages?.script || []} />
          <StatusStackedBar label="Audio" rows={data?.courseVideoStages?.audio || []} />
          <StatusStackedBar label="Video" rows={data?.courseVideoStages?.video || []} />
        </div>
      </Card>

      {/* Recent failures */}
      <Card className="mt-6 animate-slide-up" style={{ "--stagger-index": 16 }}>
        <CardHeader
          title={
            <span className="flex items-center gap-2">
              <AlertTriangle className="size-4 text-text-tertiary" /> Recent Failures
            </span>
          }
          subtitle="Latest failed video jobs and course video stages"
          extra={
            (data?.recentFailures || []).length > 0 && (
              <Badge variant="danger">{data.recentFailures.length}</Badge>
            )
          }
        />
        <div className="p-2">
          {(data?.recentFailures || []).length === 0 ? (
            <EmptyState description="No failures — everything is running smoothly." />
          ) : (
            <div className="divide-y divide-border-light">
              {data.recentFailures.map((f) => (
                <div key={`${f.source}-${f.id}`} className="flex items-start gap-3 px-3 py-3">
                  <div className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-danger-500/10 text-danger-600 dark:text-danger-500">
                    <AlertTriangle className="size-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="truncate text-sm font-medium text-text-primary">{f.title}</p>
                      <Badge variant="neutral">{f.source === "videoJob" ? "Video Job" : "Course Video"}</Badge>
                    </div>
                    <p className="mt-0.5 truncate text-xs text-text-tertiary">{f.subtitle}</p>
                    <p className="mt-1 text-xs text-danger-600 dark:text-danger-500">{f.message}</p>
                  </div>
                  <div className="shrink-0 text-right text-xs text-text-tertiary">
                    <span className="inline-flex items-center gap-1">
                      <Clock className="size-3" />
                      {new Date(f.occurredAt).toLocaleString()}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </Card>
    </div>
  );
};

export default Analytics;
