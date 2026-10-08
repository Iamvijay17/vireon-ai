import { Gauge, Timer, DatabaseZap, ShieldAlert, Server } from "lucide-react";
import { getControlCenter } from "../../services/api";
import { LoadingState, EmptyState } from "../../components";
import { Card, CardHeader } from "../../components/ui/Card";
import { Badge } from "../../components/ui/Badge";
import { Table } from "../../components/ui/Table";
import { useApiQuery } from "../../lib/useApiQuery";
import { queryKeys } from "../../lib/queryClient";
import { formatPercent } from "./format";
import { showCount, showDuration, showRate, stageCoverageNote, kindLabel, queueState } from "./controlCenterFormat";

const Stat = ({ label, value, hint }) => (
  <div>
    <p className="text-[11px] text-text-tertiary">{label}</p>
    <p className="text-base font-semibold tracking-tight text-text-primary">{value}</p>
    {hint && <p className="text-[11px] text-text-tertiary">{hint}</p>}
  </div>
);

const Panel = ({ icon: Icon, title, subtitle, children, className }) => (
  <Card className={`animate-slide-up rounded-2xl shadow-sm ${className || ""}`}>
    <CardHeader
      title={
        <span className="flex items-center gap-2">
          <Icon className="size-4 text-text-tertiary" /> {title}
        </span>
      }
      subtitle={subtitle}
    />
    {children}
  </Card>
);

const STAGE_COLUMNS = [
  { key: "label", title: "Stage", render: (r) => <span className="font-medium text-text-primary">{r.label}</span> },
  { key: "avgMs", title: "Average", align: "right", render: (r) => showDuration(r.avgMs) },
  { key: "maxMs", title: "Slowest", align: "right", render: (r) => showDuration(r.maxMs) },
  { key: "timedRuns", title: "Timed runs", align: "right", render: (r) => showCount(r.timedRuns) },
  { key: "reused", title: "Reused", align: "right", render: (r) => showCount(r.reused) },
];

const CACHE_COLUMNS = [
  { key: "kind", title: "Artifact", render: (r) => <span className="font-medium text-text-primary">{kindLabel(r.kind)}</span> },
  { key: "hitRate", title: "Hit rate", align: "right", render: (r) => showRate(r.hitRate) },
  { key: "hits", title: "Hits", align: "right", render: (r) => showCount(r.hits) },
  { key: "misses", title: "Misses", align: "right", render: (r) => showCount(r.misses) },
  { key: "shared", title: "Shared", align: "right", render: (r) => showCount(r.shared) },
  { key: "stale", title: "Stale", align: "right", render: (r) => showCount(r.stale) },
  { key: "avgGenerationMs", title: "Avg to make", align: "right", render: (r) => showDuration(r.avgGenerationMs) },
  { key: "timeSavedMs", title: "Time saved", align: "right", render: (r) => (r.timeSavedMs ? showDuration(r.timeSavedMs) : "—") },
];

const FAILURE_COLUMNS = [
  { key: "label", title: "Stage", render: (r) => <span className="font-medium text-text-primary">{r.label}</span> },
  { key: "attempts", title: "Attempts", align: "right", render: (r) => showCount(r.attempts) },
  { key: "failures", title: "Failures", align: "right", render: (r) => showCount(r.failures) },
  { key: "failureRate", title: "Failure rate", align: "right", render: (r) => showRate(r.failureRate) },
  { key: "retries", title: "Retries", align: "right", render: (r) => showCount(r.retries) },
];

const QueueCard = ({ name, queue }) => {
  const state = queueState(queue);
  return (
    <div className="rounded-xl border border-border-light p-3">
      <div className="flex items-center justify-between">
        <p className="text-[13px] font-semibold text-text-primary">{name}</p>
        <Badge variant={state.tone}>{state.label}</Badge>
      </div>
      {queue?.available === false ? (
        <p className="mt-2 text-xs text-text-tertiary">The queue could not be read (is Redis reachable?).</p>
      ) : (
        <div className="mt-3 grid grid-cols-3 gap-3">
          <Stat label="Queue depth" value={queue.depth} hint={`${queue.waiting} waiting · ${queue.delayed} delayed`} />
          <Stat label="Active" value={queue.active} hint={`of ${queue.concurrency}`} />
          <Stat label="Workers" value={queue.workersOnline ?? "—"} />
          <Stat label="Completed" value={showCount(queue.completed)} />
          <Stat label="Failed" value={showCount(queue.failed)} />
        </div>
      )}
    </div>
  );
};

/**
 * Control Center: real, persisted pipeline metrics - video outcomes, stage timing, cache,
 * failures by stage and worker queues. Owns its own query (the page's date range is passed
 * in). A figure with nothing behind it shows "—", never a made-up 0.
 */
export function ControlCenter({ days }) {
  const { data, loading } = useApiQuery(
    queryKeys.analytics.controlCenter(days),
    () => getControlCenter(Number(days)),
    { errorMessage: "Failed to load the control center" }
  );

  if (loading && !data) {
    return (
      <Card className="mt-4 rounded-2xl">
        <LoadingState label="Loading control center..." />
      </Card>
    );
  }
  if (!data) return null;

  const { videos, pipeline, cache, failures, workers } = data;
  const coverage = stageCoverageNote(pipeline);
  const hasStageTiming = pipeline.stages.some((s) => s.timedRuns > 0);
  const hasFailureData = failures.byStage.some((s) => s.attempts > 0);

  return (
    <div className="mt-4 space-y-4" data-testid="control-center">
      <Panel icon={Gauge} title="Videos" subtitle={`Created in the last ${days} days`}>
        <div className="grid grid-cols-2 gap-4 p-4 sm:grid-cols-3 lg:grid-cols-6">
          <Stat label="Total" value={videos.total} hint={`${videos.allTime} all time`} />
          <Stat label="Successful" value={videos.successful} hint={`${showRate(videos.successRate)} of finished`} />
          <Stat label="Failed" value={videos.failed} />
          <Stat label="Cancelled" value={videos.cancelled} />
          <Stat label="Processing" value={videos.processing} />
          <Stat label="Waiting on you" value={videos.awaitingPerson} hint="approval / next step" />
        </div>
      </Panel>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <Panel icon={Timer} title="Pipeline timing" subtitle="Time in each worker stage">
          <div className="grid grid-cols-2 gap-4 px-4 pt-4">
            <Stat label="Avg generation time" value={showDuration(pipeline.avgGenerationMs)} hint={pipeline.generationSampleSize ? `${pipeline.generationSampleSize} finished videos` : "no finished videos"} />
            <Stat label="Avg queue wait" value={showDuration(pipeline.avgQueueWaitMs)} hint="all time" />
          </div>
          {hasStageTiming ? (
            <Table rowKey="key" data={pipeline.stages} columns={STAGE_COLUMNS} className="mt-3" />
          ) : (
            <EmptyState description="No stage timing yet." />
          )}
          {coverage && <p className="px-4 pb-4 text-xs text-text-tertiary">{coverage}</p>}
        </Panel>

        <Panel icon={DatabaseZap} title="Cache" subtitle="What was reused instead of generated again">
          <div className="grid grid-cols-3 gap-4 px-4 pt-4">
            <Stat label="Hit rate" value={showRate(cache.total.hitRate)} hint={`${showCount(cache.total.hits)} hits · ${showCount(cache.total.misses)} misses`} />
            <Stat label="Time saved" value={cache.total.timeSavedMs ? showDuration(cache.total.timeSavedMs) : "—"} hint="from measured generation times" />
            <Stat label="Voice reuse (all time)" value={formatPercent(cache.legacyTtsHitRate)} />
          </div>
          {cache.byKind.length > 0 ? (
            <Table rowKey="kind" data={cache.byKind} columns={CACHE_COLUMNS} className="mt-3" />
          ) : (
            <EmptyState description="No cache activity recorded in this range yet." />
          )}
        </Panel>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <Panel icon={ShieldAlert} title="Failures" subtitle="By stage, from the job event stream">
          {hasFailureData ? (
            <Table rowKey="stage" data={failures.byStage} columns={FAILURE_COLUMNS} />
          ) : (
            <EmptyState description="No stage attempts recorded in this range yet." />
          )}
          <div className="grid grid-cols-3 gap-4 border-t border-border-light p-4">
            <Stat label="Jobs retried" value={showRate(failures.retries.retryRate)} hint={`${failures.retries.retriedJobs} jobs`} />
            <Stat label="Total retries" value={failures.retries.totalRetries} />
            <Stat label="Avg per retried job" value={failures.retries.avgRetriesPerRetriedJob ?? "—"} />
          </div>
        </Panel>

        <Panel icon={ShieldAlert} title="Top errors" subtitle="What is going wrong most often">
          {failures.topErrors.length > 0 ? (
            <ul className="divide-y divide-border-light">
              {failures.topErrors.map((e) => (
                <li key={`${e.code}:${e.stage}`} className="flex items-start justify-between gap-3 px-4 py-2.5">
                  <div className="min-w-0">
                    <p className="text-[13px] font-medium text-text-primary">
                      {e.code} {e.stage && <span className="font-normal text-text-tertiary">· {e.stage}</span>}
                    </p>
                    {e.message && <p className="truncate text-xs text-text-tertiary">{e.message}</p>}
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    {e.retryable === false && <Badge variant="neutral">not retried</Badge>}
                    <Badge variant="danger">{e.count}×</Badge>
                  </div>
                </li>
              ))}
            </ul>
          ) : failures.failedJobsByCode.length > 0 ? (
            <ul className="divide-y divide-border-light">
              {failures.failedJobsByCode.map((e) => (
                <li key={e.code} className="flex items-center justify-between px-4 py-2.5">
                  <p className="text-[13px] font-medium text-text-primary">{e.code}</p>
                  <Badge variant="danger">{e.count}×</Badge>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState description="No failures recorded in this range." />
          )}
        </Panel>
      </div>

      <Panel icon={Server} title="Workers" subtitle="Queue depth and activity right now">
        <div className="grid grid-cols-1 gap-3 p-4 md:grid-cols-2">
          <QueueCard name="Video worker" queue={workers.video} />
          <QueueCard name="Course video worker" queue={workers.course} />
        </div>
      </Panel>
    </div>
  );
}
