import { useEffect, useMemo, useState } from "react";
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
  Tag,
  Mic2,
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
import { Tabs } from "../../components/ui/Tabs";
import { TrendChart } from "../../components/charts/TrendChart";
import { RankedBarChart } from "../../components/charts/RankedBarChart";
import { CATEGORICAL_PALETTE } from "../../lib/chartPalette";
import { StatusStackedBar } from "../../components/charts/StatusStackedBar";
import { StatusDonut } from "../../components/charts/StatusDonut";
import { GaugeRing } from "../../components/charts/GaugeRing";
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
// between the two halves - a lightweight period-over-period delta without
// needing a backend call.
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

// Solid, circular icon badges (not soft gradient squares) to match a
// real-dashboard look - each KPI card's icon reads as a colored dot.
const toneCls = {
  accent: "bg-accent-500/15 text-accent-600 dark:text-accent-400",
  warning: "bg-warning-500/15 text-warning-600 dark:text-warning-500",
  success: "bg-success-500/15 text-success-600 dark:text-success-500",
  danger: "bg-danger-500/15 text-danger-600 dark:text-danger-500",
  info: "bg-info-500/15 text-info-600 dark:text-info-500",
};

const BREAKDOWN_TABS = [
  { key: "jobStatus", label: "Job Status", icon: <Layers className="size-3.5" /> },
  { key: "courseStatus", label: "Course Status", icon: <BookOpen className="size-3.5" /> },
  { key: "templates", label: "Templates", icon: <MonitorPlay className="size-3.5" /> },
  { key: "resolution", label: "Resolution", icon: <Video className="size-3.5" /> },
  { key: "categories", label: "Categories", icon: <Tag className="size-3.5" /> },
  { key: "storage", label: "Storage", icon: <HardDrive className="size-3.5" /> },
];

const Analytics = () => {
  const [days, setDays] = useState("30");
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [breakdownTab, setBreakdownTab] = useState("jobStatus");

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

  const summary = data?.summary || {};
  const trend = useMemo(() => data?.trend || [], [data]);
  const hasActivity = trend.some(
    (d) => d.jobsCreated || d.jobsCompleted || d.jobsFailed || d.courseVideosRendered
  );

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

  const successDelta = (() => {
    const rates = successRateSeries(trend);
    const n = rates.length;
    if (n < 4) return null;
    const mid = Math.floor(n / 2);
    const avg = (arr) => arr.reduce((s, v) => s + v, 0) / (arr.length || 1);
    const prev = avg(rates.slice(0, mid));
    const curr = avg(rates.slice(mid));
    if (!prev) return null;
    return { pct: Math.round(curr - prev) };
  })();

  const kpiTiles = [
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
      delta: successDelta,
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
      title: "Course Completion",
      value: formatPercent(summary.courseCompletionRate),
      icon: GraduationCap,
      tone: "info",
      delta: trendDelta(trend, "courseVideosRendered"),
      caption: `${summary.completedCourses ?? 0} of ${summary.totalCourses ?? 0} courses`,
    },
  ];

  const timeStats = [
    { title: "Avg. Render Time", value: formatDuration(summary.avgRenderTimeMs), icon: Timer, tone: "warning" },
    { title: "Avg. TTS Time", value: formatDuration(summary.avgTtsTimeMs), icon: Mic2, tone: "accent" },
  ];

  const trendSeries = [
    { key: "jobsCreated", label: "Jobs created", color: "var(--color-accent-500)" },
    { key: "jobsCompleted", label: "Jobs completed", color: "var(--color-success-500)" },
    { key: "jobsFailed", label: "Jobs failed", color: "var(--color-danger-500)" },
    { key: "courseVideosRendered", label: "Course videos rendered", color: "var(--color-info-500)" },
  ];

  const activeTabMeta = BREAKDOWN_TABS.find((t) => t.key === breakdownTab);

  const renderBreakdown = () => {
    switch (breakdownTab) {
      case "jobStatus":
        return <StatusDonut rows={data?.jobsByStatus || []} emptyLabel="No video jobs yet." />;
      case "courseStatus":
        return <StatusDonut rows={data?.coursesByStatus || []} emptyLabel="No courses yet." />;
      case "templates":
        return (
          <RankedBarChart rows={data?.topTemplates || []} palette={CATEGORICAL_PALETTE} emptyLabel="No video jobs yet." />
        );
      case "resolution":
        return (
          <RankedBarChart rows={data?.jobsByResolution || []} palette={CATEGORICAL_PALETTE} emptyLabel="No video jobs yet." />
        );
      case "categories":
        return (
          <RankedBarChart rows={data?.coursesByCategory || []} palette={CATEGORICAL_PALETTE} emptyLabel="No courses yet." />
        );
      case "storage":
        return (data?.storageByCategory || []).length === 0 ? (
          <EmptyState description="No assets uploaded yet." />
        ) : (
          <RankedBarChart
            rows={(data.storageByCategory || []).map((r) => ({ label: r.label, count: r.bytes }))}
            palette={CATEGORICAL_PALETTE}
            formatValue={formatBytes}
          />
        );
      default:
        return null;
    }
  };

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

      {/* KPI cards - individual panels, not a fused strip: soft shadow, solid
          circular icon badge, bold value, pill delta badge + caption */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {kpiTiles.map((s, i) => (
          <Card
            key={s.title}
            className="animate-slide-up rounded-2xl p-4 shadow-sm"
            style={{ "--stagger-index": i }}
          >
            <div className="flex items-start justify-between">
              <p className="text-xs font-medium text-text-tertiary">{s.title}</p>
              <div className={`flex size-8 shrink-0 items-center justify-center rounded-full ${toneCls[s.tone]}`}>
                <s.icon className="size-4" />
              </div>
            </div>
            <p className="mt-3 text-[26px] font-bold leading-none tracking-tight text-text-primary">{s.value}</p>
            <div className="mt-2.5 flex items-center gap-1.5">
              {s.delta && (
                <DeltaBadge delta={s.delta} suffix={s.deltaSuffix || "%"} invert={s.invertDelta} />
              )}
              <span className="truncate text-[11px] text-text-tertiary">{s.caption}</span>
            </div>
          </Card>
        ))}
      </div>

      {/* Trend + at-a-glance side column, mirroring a chart-plus-gauges layout */}
      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="animate-slide-up rounded-2xl shadow-sm lg:col-span-2" style={{ "--stagger-index": 4 }}>
          <CardHeader
            title={
              <span className="flex items-center gap-2">
                <Activity className="size-4 text-text-tertiary" /> Render Activity
              </span>
            }
            subtitle={`Jobs and course videos over the last ${days} days`}
          />
          <div className="p-3">
            {hasActivity ? (
              <TrendChart data={data.trend} series={trendSeries} />
            ) : (
              <EmptyState description="No render activity in this range yet." />
            )}
          </div>
        </Card>

        <div className="flex flex-col gap-4">
          <Card className="animate-slide-up rounded-2xl p-4 shadow-sm" style={{ "--stagger-index": 5 }}>
            <p className="text-xs font-medium text-text-secondary">Processing Time</p>
            <div className="mt-3 space-y-3">
              {timeStats.map((s) => (
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

          <Card className="animate-slide-up flex flex-1 flex-col items-center justify-center rounded-2xl p-4 text-center shadow-sm" style={{ "--stagger-index": 6 }}>
            <p className="self-start text-xs font-medium text-text-secondary">Cache Hit Rate</p>
            <GaugeRing
              value={summary.cacheHitRate}
              color="var(--color-success-500)"
              label="avatar clips & TTS audio reuse"
              size={112}
              className="mt-2"
            />
            <p className="mt-2 flex items-center gap-1.5 text-[11px] text-text-tertiary">
              <HardDrive className="size-3" /> {formatBytes(summary.totalStorageBytes)} stored
            </p>
          </Card>
        </div>
      </div>

      {/* Breakdown - tabbed to keep six related views in one focused card */}
      <Card className="mt-4 animate-slide-up rounded-2xl shadow-sm" style={{ "--stagger-index": 7 }}>
        <Tabs items={BREAKDOWN_TABS} active={breakdownTab} onChange={setBreakdownTab} className="px-3" />
        <div className="p-3" key={breakdownTab}>
          <p className="mb-2 text-xs text-text-tertiary">
            {activeTabMeta?.label} breakdown across {breakdownTab.startsWith("course") || breakdownTab === "categories" ? "all courses" : "all video jobs"}
          </p>
          {renderBreakdown()}
        </div>
      </Card>

      {/* Course pipeline health */}
      <Card className="mt-4 animate-slide-up rounded-2xl shadow-sm" style={{ "--stagger-index": 8 }}>
        <CardHeader title="Course Video Pipeline" subtitle="Script, audio and render stage status across all lessons" />
        <div className="grid grid-cols-1 gap-3 p-3 md:grid-cols-3">
          <StatusStackedBar label="Script" rows={data?.courseVideoStages?.script || []} />
          <StatusStackedBar label="Audio" rows={data?.courseVideoStages?.audio || []} />
          <StatusStackedBar label="Video" rows={data?.courseVideoStages?.video || []} />
        </div>
      </Card>

      {/* Recent failures */}
      <Card className="mt-4 animate-slide-up rounded-2xl shadow-sm" style={{ "--stagger-index": 9 }}>
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
                <div key={`${f.source}-${f.id}`} className="flex items-start gap-3 px-3 py-2">
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
