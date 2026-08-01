import { useEffect, useState } from "react";
import { FolderKanban, CheckCircle2, Timer, GraduationCap, RefreshCw, AlertTriangle } from "lucide-react";
import { getAnalyticsOverview } from "../../services/api";
import { PageHeader, LoadingState, EmptyState } from "../../components";
import { Card, CardHeader } from "../../components/ui/Card";
import { Button } from "../../components/ui/Button";
import { Select } from "../../components/ui/Select";
import { Badge } from "../../components/ui/Badge";
import { TrendChart } from "../../components/charts/TrendChart";
import { BarList } from "../../components/charts/BarList";
import { StatusStackedBar } from "../../components/charts/StatusStackedBar";
import { toast } from "../../components/ui/toastBus";

const RANGE_OPTIONS = [
  { value: "7", label: "Last 7 days" },
  { value: "30", label: "Last 30 days" },
  { value: "90", label: "Last 90 days" },
];

const formatDuration = (ms) => {
  if (!ms && ms !== 0) return "—";
  const minutes = ms / 60000;
  if (minutes < 1) return `${Math.round(ms / 1000)}s`;
  if (minutes < 60) return `${minutes.toFixed(1)}m`;
  return `${(minutes / 60).toFixed(1)}h`;
};

const formatPercent = (v) => (v === null || v === undefined ? "—" : `${v}%`);

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
      toast.error(err.response?.data?.error || "Failed to load analytics");
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
  const hasActivity = (data?.trend || []).some(
    (d) => d.jobsCreated || d.jobsCompleted || d.jobsFailed || d.courseVideosRendered
  );

  const stats = [
    { title: "Total Video Jobs", value: summary.totalVideoJobs ?? 0, icon: FolderKanban, tone: "accent" },
    { title: "Job Success Rate", value: formatPercent(summary.jobSuccessRate), icon: CheckCircle2, tone: "success" },
    { title: "Avg. Render Time", value: formatDuration(summary.avgRenderTimeMs), icon: Timer, tone: "warning" },
    {
      title: "Course Completion",
      value: formatPercent(summary.courseCompletionRate),
      icon: GraduationCap,
      tone: "info",
    },
  ];

  const toneCls = {
    accent: "bg-accent-subtle text-accent",
    warning: "bg-warning-500/10 text-warning-600 dark:text-warning-500",
    success: "bg-success-500/10 text-success-600 dark:text-success-500",
    danger: "bg-danger-500/10 text-danger-600 dark:text-danger-500",
    info: "bg-info-500/10 text-info-600 dark:text-info-500",
  };

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

      {/* Stats */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {stats.map((s, i) => (
          <Card key={s.title} hoverable className="animate-slide-up p-5" style={{ "--stagger-index": i }}>
            <div className={`mb-3 flex size-10 items-center justify-center rounded-[10px] ${toneCls[s.tone]}`}>
              <s.icon className="size-[19px]" />
            </div>
            <p className="text-xs font-medium text-text-tertiary">{s.title}</p>
            <p className="mt-1 text-2xl font-semibold text-text-primary">{s.value}</p>
          </Card>
        ))}
      </div>

      {/* Trend */}
      <Card className="mt-6 animate-slide-up" style={{ "--stagger-index": 4 }}>
        <CardHeader title="Render Activity" subtitle={`Jobs and course videos over the last ${days} days`} />
        <div className="p-5">
          {hasActivity ? (
            <TrendChart data={data.trend} series={trendSeries} />
          ) : (
            <EmptyState description="No render activity in this range yet." />
          )}
        </div>
      </Card>

      {/* Breakdown row 1 */}
      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card className="animate-slide-up" style={{ "--stagger-index": 5 }}>
          <CardHeader title="Video Jobs by Status" />
          <div className="p-5">
            {(data?.jobsByStatus || []).length === 0 ? (
              <EmptyState description="No video jobs yet." />
            ) : (
              <StatusStackedBar label="All video jobs" rows={data.jobsByStatus} />
            )}
          </div>
        </Card>

        <Card className="animate-slide-up" style={{ "--stagger-index": 6 }}>
          <CardHeader title="Video Jobs by Type" />
          <div className="p-5">
            <BarList rows={data?.jobsByType || []} color="var(--color-accent-500)" emptyLabel="No video jobs yet." />
          </div>
        </Card>
      </div>

      {/* Breakdown row 2 */}
      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card className="animate-slide-up" style={{ "--stagger-index": 7 }}>
          <CardHeader title="Video Jobs by Resolution" />
          <div className="p-5">
            <BarList rows={data?.jobsByResolution || []} color="var(--color-info-500)" emptyLabel="No video jobs yet." />
          </div>
        </Card>

        <Card className="animate-slide-up" style={{ "--stagger-index": 8 }}>
          <CardHeader title="Courses by Category" />
          <div className="p-5">
            <BarList rows={data?.coursesByCategory || []} color="var(--color-accent-500)" emptyLabel="No courses yet." />
          </div>
        </Card>
      </div>

      {/* Course pipeline health */}
      <Card className="mt-6 animate-slide-up" style={{ "--stagger-index": 9 }}>
        <CardHeader title="Course Video Pipeline" subtitle="Script, audio and render stage status across all lessons" />
        <div className="grid grid-cols-1 gap-6 p-5 md:grid-cols-3">
          <StatusStackedBar label="Script" rows={data?.courseVideoStages?.script || []} />
          <StatusStackedBar label="Audio" rows={data?.courseVideoStages?.audio || []} />
          <StatusStackedBar label="Video" rows={data?.courseVideoStages?.video || []} />
        </div>
      </Card>

      {/* Recent failures */}
      <Card className="mt-6 animate-slide-up" style={{ "--stagger-index": 10 }}>
        <CardHeader title="Recent Failures" subtitle="Latest failed video jobs and course video stages" />
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
                    {new Date(f.occurredAt).toLocaleString()}
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
