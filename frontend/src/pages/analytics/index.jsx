import { useMemo, useState } from "react";
import {
  Video, Mic2, Activity, HardDrive, Layers, BookOpen, MonitorPlay, Tag, LayoutGrid, Cpu, RefreshCw,
} from "lucide-react";
import { getAnalyticsOverview } from "../../services/api";
import { PageHeader, LoadingState, EmptyState } from "../../components";
import { Card, CardHeader } from "../../components/ui/Card";
import { Button } from "../../components/ui/Button";
import { Select } from "../../components/ui/Select";
import { TrendChart } from "../../components/charts/TrendChart";
import { RankedBarChart } from "../../components/charts/RankedBarChart";
import { CATEGORICAL_PALETTE } from "../../lib/chartPalette";
import { StatusStackedBar } from "../../components/charts/StatusStackedBar";
import { StatusDonut } from "../../components/charts/StatusDonut";
import { GaugeRing } from "../../components/charts/GaugeRing";
import { useApiQuery } from "../../lib/useApiQuery";
import { queryKeys } from "../../lib/queryClient";
import { formatBytes, formatPercent } from "./format";
import { KpiTiles, ProcessingTimeCard } from "./StatTiles";
import { ChartCard } from "./ChartCard";
import { VideoMetricsTable } from "./VideoMetricsTable";
import { RecentFailures } from "./RecentFailures";
import { ControlCenter } from "./ControlCenter";

const RANGE_OPTIONS = [
  { value: "7", label: "Last 7 days" },
  { value: "30", label: "Last 30 days" },
  { value: "90", label: "Last 90 days" },
];

const TREND_SERIES = [
  { key: "jobsCreated", label: "Jobs created", color: "var(--color-accent-500)" },
  { key: "jobsCompleted", label: "Jobs completed", color: "var(--color-success-500)" },
  { key: "jobsFailed", label: "Jobs failed", color: "var(--color-danger-500)" },
  { key: "courseVideosRendered", label: "Course videos rendered", color: "var(--color-info-500)" },
];

const Stat = ({ label, value }) => (
  <div>
    <p className="text-[11px] text-text-tertiary">{label}</p>
    <p className="text-base font-semibold tracking-tight text-text-primary">{value}</p>
  </div>
);

/**
 * Analytics: KPIs, activity trend, breakdowns and per-video stage timing for
 * the selected date range. Each panel is its own component next to this file;
 * this owns the overview data and the layout.
 */
const Analytics = () => {
  const [days, setDays] = useState("30");
  const { data, loading, refreshing, refetch } = useApiQuery(
    queryKeys.analytics.overview(days),
    () => getAnalyticsOverview(Number(days)),
    { errorMessage: "Failed to load analytics" }
  );

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

  return (
    <div>
      <PageHeader
        title="Analytics"
        description="End-to-end metrics across your video and course pipelines."
        extra={
          <>
            <Select value={days} onChange={setDays} options={RANGE_OPTIONS} className="w-40" />
            <Button variant="secondary" size="sm" loading={loading || refreshing} onClick={() => refetch()} icon={<RefreshCw className="size-4" />}>
              Refresh
            </Button>
          </>
        }
      />

      <KpiTiles summary={summary} trend={trend} />

      {/* Trend + at-a-glance side column, mirroring a chart-plus-gauges layout */}
      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <ChartCard icon={Activity} title="Render Activity" subtitle={`Jobs and course videos over the last ${days} days`} stagger={4} className="lg:col-span-2">
          {hasActivity ? (
            <TrendChart data={data.trend} series={TREND_SERIES} />
          ) : (
            <EmptyState description="No render activity in this range yet." />
          )}
        </ChartCard>

        <div className="flex flex-col gap-4">
          <ProcessingTimeCard summary={summary} />

          <Card className="animate-slide-up flex flex-1 flex-col items-center justify-center rounded-2xl p-4 text-center shadow-sm" style={{ "--stagger-index": 6 }}>
            <p className="self-start text-xs font-medium text-text-secondary">Cache Hit Rate</p>
            <GaugeRing
              value={summary.cacheHitRate}
              color="var(--color-success-500)"
              label="TTS audio reuse"
              size={112}
              className="mt-2"
            />
            <p className="mt-2 flex items-center gap-1.5 text-[11px] text-text-tertiary">
              <HardDrive className="size-3" /> {formatBytes(summary.totalStorageBytes)} stored
            </p>
          </Card>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <ChartCard icon={Layers} title="Job Status" stagger={7}>
          <StatusDonut rows={data?.jobsByStatus || []} emptyLabel="No video jobs yet." />
        </ChartCard>
        <ChartCard icon={BookOpen} title="Course Status" stagger={8}>
          <StatusDonut rows={data?.coursesByStatus || []} emptyLabel="No courses yet." />
        </ChartCard>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <ChartCard icon={MonitorPlay} title="Templates" stagger={9}>
          <RankedBarChart rows={data?.topTemplates || []} palette={CATEGORICAL_PALETTE} emptyLabel="No video jobs yet." />
        </ChartCard>
        <ChartCard icon={Video} title="Resolution" stagger={10}>
          <RankedBarChart rows={data?.jobsByResolution || []} palette={CATEGORICAL_PALETTE} emptyLabel="No video jobs yet." />
        </ChartCard>
        <ChartCard icon={Tag} title="Categories" stagger={11}>
          <RankedBarChart rows={data?.coursesByCategory || []} palette={CATEGORICAL_PALETTE} emptyLabel="No courses yet." />
        </ChartCard>
        <ChartCard icon={HardDrive} title="Storage" stagger={12}>
          {(data?.storageByCategory || []).length === 0 ? (
            <EmptyState description="No assets uploaded yet." />
          ) : (
            <RankedBarChart
              rows={(data.storageByCategory || []).map((r) => ({ label: r.label, count: r.bytes }))}
              palette={CATEGORICAL_PALETTE}
              formatValue={formatBytes}
            />
          )}
        </ChartCard>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <ChartCard icon={Mic2} title="Voices" stagger={13}>
          <RankedBarChart rows={data?.topVoices || []} palette={CATEGORICAL_PALETTE} emptyLabel="No video jobs yet." />
        </ChartCard>
        <ChartCard icon={LayoutGrid} title="Layouts" subtitle="By orientation (aspect ratio)" stagger={14}>
          <RankedBarChart rows={data?.topLayouts || []} palette={CATEGORICAL_PALETTE} emptyLabel="No video jobs yet." />
        </ChartCard>

        <Card className="animate-slide-up rounded-2xl p-4 shadow-sm" style={{ "--stagger-index": 15 }}>
          <p className="flex items-center gap-2 text-xs font-medium text-text-secondary">
            <Cpu className="size-4 text-text-tertiary" /> Worker Performance
          </p>
          <div className="mt-3 grid grid-cols-2 gap-3">
            <Stat label="Concurrency" value={data?.worker?.concurrency ?? "—"} />
            <Stat label="Active Jobs" value={data?.worker?.activeJobs ?? 0} />
            <Stat label="Waiting Jobs" value={data?.worker?.waitingJobs ?? 0} />
            <Stat label="Jobs Retried" value={formatPercent(data?.worker?.retryRate)} />
          </div>
        </Card>
      </div>

      {/* Course pipeline health */}
      <Card className="mt-4 animate-slide-up rounded-2xl shadow-sm" style={{ "--stagger-index": 16 }}>
        <CardHeader title="Course Video Pipeline" subtitle="Script, audio and render stage status across all lessons" />
        <div className="grid grid-cols-1 gap-3 p-3 md:grid-cols-3">
          <StatusStackedBar label="Script" rows={data?.courseVideoStages?.script || []} />
          <StatusStackedBar label="Audio" rows={data?.courseVideoStages?.audio || []} />
          <StatusStackedBar label="Video" rows={data?.courseVideoStages?.video || []} />
        </div>
      </Card>

      <ControlCenter days={days} />

      <VideoMetricsTable />

      <RecentFailures failures={data?.recentFailures || []} />
    </div>
  );
};

export default Analytics;
