import { useMemo, useState } from "react";
import { RefreshCw, Info } from "lucide-react";
import { Card, CardHeader, CardBody } from "../../components/ui/Card";
import { Button } from "../../components/ui/Button";
import { Select } from "../../components/ui/Select";
import { Alert } from "../../components/ui/Alert";
import { Table } from "../../components/ui/Table";
import { Tooltip } from "../../components/ui/Tooltip";
import { cn } from "../../components/ui/cn";
import { toast } from "../../components/ui/toastBus";
import { ErrorState, EmptyState } from "../../components";
import { TrendChart } from "../../components/charts/TrendChart";
import { BarList } from "../../components/charts/BarList";
import { useInvalidate } from "../../lib/useApiQuery";
import { queryKeys } from "../../lib/queryClient";
import { refreshSocialAnalytics } from "../../services/api";
import { useSocialAnalytics, useBusy } from "./usePromotion";
import { PlatformBadge, RemoteLink, SkeletonRows } from "./shared";
import { PLATFORMS, platformLabel, formatMetric, formatCount, successRateText, formatInZone } from "./format";

const RANGES = [{ value: "7", label: "Last 7 days" }, { value: "30", label: "Last 30 days" }, { value: "90", label: "Last 90 days" }, { value: "365", label: "Last year" }];
const SERIES = [
  { key: "published", label: "Published", color: "var(--color-success-500)" },
  { key: "failed", label: "Failed", color: "var(--color-danger-500)" },
];

const Tile = ({ label, value, hint }) => (
  <div className="rounded-xl border border-border-light p-4">
    <p className="text-xs font-medium uppercase tracking-wide text-text-tertiary">{label}</p>
    <p className="mt-1.5 text-2xl font-semibold tabular-nums text-text-primary">{value}</p>
    {hint && <p className="mt-0.5 text-xs text-text-tertiary">{hint}</p>}
  </div>
);

/**
 * Results from the platforms' own APIs. A figure appears only when a platform reported it; "Not available" is
 * shown as exactly that - never as 0 - and a total says how many posts contributed to it.
 */
export const AnalyticsPanel = () => {
  const invalidate = useInvalidate();
  const { isBusy, run } = useBusy();
  const [platform, setPlatform] = useState("");
  const [days, setDays] = useState("30");

  const params = useMemo(() => {
    const to = new Date();
    const from = new Date(to.getTime() - Number(days) * 86400_000);
    return { from: from.toISOString(), ...(platform ? { platform } : {}) };
  }, [days, platform]);
  const { data, loading, error, refetch } = useSocialAnalytics(params);

  const refresh = async () => {
    const res = await run("refresh", () => refreshSocialAnalytics(platform ? { platform } : {}));
    if (!res) return;
    const { refreshed, failed } = res.data;
    if (failed) toast.error(`Updated ${refreshed} post${refreshed === 1 ? "" : "s"}; ${failed} could not be read. Open a post for the reason.`);
    else toast.success(refreshed ? `Updated insights for ${refreshed} post${refreshed === 1 ? "" : "s"}` : "Insights are already up to date");
    invalidate(queryKeys.social.all);
  };

  const t = data?.totals;
  const metrics = Object.entries(data?.metrics || {}).map(([key, m]) => ({ ...m, _id: key, key }));
  const platformRows = PLATFORMS.map((p) => ({ label: p, count: data?.byPlatform?.[p]?.published || 0 })).filter((r) => r.count > 0);
  const fresh = data?.freshness;

  const metricColumns = [
    { key: "label", title: "Metric", render: (m) => <span className="text-[13px] font-medium text-text-primary">{m.label}</span> },
    { key: "value", title: "Total", render: (m) => {
      const f = formatMetric(m.key, m);
      return f.available
        ? <span className="text-[15px] font-semibold tabular-nums text-text-primary">{f.text}</span>
        : (
          <Tooltip content={m.reason || "The platform did not report this"}>
            <span className="inline-flex items-center gap-1 text-[13px] italic text-text-tertiary">{f.text}<Info className="size-3.5" /></span>
          </Tooltip>
        );
    } },
    { key: "coverage", title: "Reported by", render: (m) => <span className="text-xs text-text-tertiary">{m.reporting} of {m.of} post{m.of === 1 ? "" : "s"}</span> },
    { key: "by", title: "By platform", render: (m) => (
      <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-text-secondary">
        {Object.entries(m.byPlatform || {}).map(([p, v]) => <span key={p}>{platformLabel(p)}: <strong className="tabular-nums">{formatMetric(m.key, { available: true, value: v.total }).text}</strong></span>)}
        {!Object.keys(m.byPlatform || {}).length && <span className="text-text-tertiary">—</span>}
      </div>
    ) },
  ];

  return (
    <div className="space-y-4">
      <Card>
        <CardBody className="flex flex-wrap items-end gap-3">
          <div className="w-44"><p className="mb-1.5 text-[13px] font-medium text-text-secondary">Platform</p><Select value={platform} onChange={setPlatform} options={[{ value: "", label: "All platforms" }, ...PLATFORMS.map((p) => ({ value: p, label: platformLabel(p) }))]} /></div>
          <div className="w-44"><p className="mb-1.5 text-[13px] font-medium text-text-secondary">Date range</p><Select value={days} onChange={setDays} options={RANGES} /></div>
          <div className="ml-auto flex items-center gap-3">
            {fresh?.newestFetchedAt && <span className="text-xs text-text-tertiary">Updated {formatInZone(fresh.newestFetchedAt)}</span>}
            <Button variant="primary" icon={<RefreshCw className="size-4" />} loading={isBusy("refresh")} onClick={refresh}>Update from platforms</Button>
          </div>
        </CardBody>
      </Card>

      {error && <ErrorState message="Could not load analytics" onRetry={refetch} />}
      {loading ? <SkeletonRows rows={3} /> : t && (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Tile label="Published" value={t.published} hint={`${t.posts} post${t.posts === 1 ? "" : "s"} in range`} />
            <Tile label="Success rate" value={successRateText(t.successRate)} hint={t.successRate === null ? "No finished posts yet" : `${t.published} published, ${t.failed} failed`} />
            <Tile label="Failed" value={t.failed} />
            <Tile label="Scheduled" value={t.scheduled} hint={t.inFlight ? `${t.inFlight} in progress` : undefined} />
          </div>

          <div className="grid gap-4 lg:grid-cols-3">
            <Card className="lg:col-span-2">
              <CardHeader title="Publishing activity" subtitle="Published and failed posts per day" />
              <CardBody>{data.timeline.length ? <TrendChart data={data.timeline} series={SERIES} /> : <EmptyState description="No posts finished in this range." />}</CardBody>
            </Card>
            <Card>
              <CardHeader title="Published by platform" />
              <CardBody><BarList rows={platformRows} emptyLabel="Nothing published in this range" /></CardBody>
            </Card>
          </div>

          <Card>
            <CardHeader title="Platform-reported results" subtitle="Only what Meta's APIs return for these accounts. Platforms can delay metrics by up to 48 hours." />
            <CardBody className="space-y-3">
              {fresh && fresh.published > 0 && (fresh.neverFetched > 0 || fresh.stale > 0) && (
                <Alert type="info" title="Some numbers are out of date">
                  {fresh.neverFetched > 0 ? `${fresh.neverFetched} published post${fresh.neverFetched === 1 ? " has" : "s have"} never been read. ` : ""}
                  {fresh.stale > 0 ? `${fresh.stale} ${fresh.stale === 1 ? "is" : "are"} older than the cache. ` : ""}
                  Press &quot;Update from platforms&quot; to fetch them (a few at a time, to respect rate limits).
                </Alert>
              )}
              {metrics.length === 0 ? (
                <EmptyState description={t.published ? "No platform has reported results for these posts yet. Press “Update from platforms”." : "Publish a post to start collecting results."} />
              ) : (
                <Table columns={metricColumns} data={metrics} rowKey="_id" />
              )}
              <p className="text-xs text-text-tertiary">{data.unreportable?.note} Different platforms report different metrics (for example, Threads has no reach figure), so a total only covers the posts that reported it.</p>
            </CardBody>
          </Card>

          {data.topPosts?.length > 0 && (
            <Card>
              <CardHeader title="Top posts by views" />
              <CardBody className="divide-y divide-border-light">
                {data.topPosts.map((p) => (
                  <div key={p.postId} className={cn("flex flex-wrap items-center gap-3 py-2.5 first:pt-0 last:pb-0")}>
                    <PlatformBadge platform={p.platform} />
                    <p className="min-w-0 flex-1 truncate text-[13px] text-text-secondary">{p.caption || "(no text)"}</p>
                    <span className="text-[13px] font-semibold tabular-nums text-text-primary">{formatCount(p.views)} views</span>
                    <RemoteLink url={p.permalink}>Open</RemoteLink>
                  </div>
                ))}
              </CardBody>
            </Card>
          )}
        </>
      )}
    </div>
  );
};

export default AnalyticsPanel;
