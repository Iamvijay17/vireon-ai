import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Plus, RefreshCw, Rocket, Film, Redo2, Pencil, Square, AlertTriangle } from "lucide-react";
import { restartVideoJob, stopVideoJob } from "../../services/api";
import { useVideoJobs, useInvalidateJobs } from "../../lib/useJobs";
import { LoadingState, EmptyState, ErrorState, PageHeader, StatusBadge, ConnectionIndicator } from "../../components";
import { Card, CardHeader } from "../../components/ui/Card";
import { Button } from "../../components/ui/Button";
import { Progress } from "../../components/ui/Progress";
import { toast } from "../../components/ui/toastBus";
import { confirmDialog } from "../../components/ui/confirmBus";
import { isJobRunning, staleForMs } from "../../lib/jobStatus";
import { formatElapsed } from "../../lib/format";
import { timeAgo } from "../../lib/timeAgo";
import { typeLabel } from "../../lib/projectModel";

const TERMINAL_STATUSES = ["COMPLETED", "FAILED", "CANCELLED"];
// Safety net only - see useVideoJobs. Socket events invalidate this query
// too (lib/useSocketQuerySync.js); this covers per-job progress, which is
// pushed only to sockets that joined that job's room.
const ACTIVE_POLL_MS = 10000;

/**
 * Landing view for /render with no job id (the sidebar "Render" link never
 * carries one). Shows the live render queue instead of a dead end.
 *
 * Data comes from useVideoJobs, refreshed by socket-driven cache
 * invalidation (lib/useSocketQuerySync.js) plus a slow safety-net refetch
 * while anything is actively rendering. The safety net is still needed
 * here specifically because per-job *progress* is only pushed to sockets
 * that joined that job's room (see SocketService.emitJobProgress), and this
 * page opens no single job's room.
 */
const RenderQueue = () => {
  const navigate = useNavigate();
  const [regeneratingId, setRegeneratingId] = useState(null);
  const [regenerateAllLoading, setRegenerateAllLoading] = useState(false);
  const [stoppingId, setStoppingId] = useState(null);
  const [stopAllLoading, setStopAllLoading] = useState(false);

  const { jobs, loading, refreshing, error, refetch } = useVideoJobs({
    isActive: (job) => !TERMINAL_STATUSES.includes(job.status),
    activePollMs: ACTIVE_POLL_MS,
  });

  const invalidateJobs = useInvalidateJobs();

  const active = jobs.filter((j) => !TERMINAL_STATUSES.includes(j.status));

  const handleRegenerate = async (job, e) => {
    e?.stopPropagation();
    const ok = await confirmDialog({
      title: "Regenerate stuck job?",
      content: `Only do this if "${job.topic}" has stopped making progress. Retriggering a job that's still actively processing can cause conflicting writes to the same files.`,
      confirmText: "Regenerate",
      danger: true,
    });
    if (!ok) return;
    try {
      setRegeneratingId(job._id);
      await restartVideoJob(job._id);
      toast.success(`Restarted "${job.topic}"`);
      invalidateJobs();
    } catch (err) {
      toast.error(err.friendlyMessage || "Failed to regenerate job");
    } finally {
      setRegeneratingId(null);
    }
  };

  const handleRegenerateAll = async () => {
    const eligible = active.filter((j) => j.status !== "QUEUED");
    if (eligible.length === 0) return;
    const ok = await confirmDialog({
      title: "Regenerate all active jobs?",
      content: `This retriggers all ${eligible.length} active job${eligible.length === 1 ? "" : "s"}. Only do this if they're genuinely stuck - jobs that are still actively processing can end up with conflicting writes to the same files.`,
      confirmText: "Regenerate All",
      danger: true,
    });
    if (!ok) return;
    try {
      setRegenerateAllLoading(true);
      const results = await Promise.allSettled(eligible.map((j) => restartVideoJob(j._id)));
      const failed = results.filter((r) => r.status === "rejected").length;
      if (failed === 0) {
        toast.success(`Restarted ${eligible.length} job${eligible.length === 1 ? "" : "s"}`);
      } else {
        toast.error(`Restarted ${eligible.length - failed}/${eligible.length} jobs - ${failed} failed`);
      }
      invalidateJobs();
    } finally {
      setRegenerateAllLoading(false);
    }
  };

  const handleStop = async (job, e) => {
    e?.stopPropagation();
    const ok = await confirmDialog({
      title: "Stop this job?",
      content: `"${job.topic}" will be marked cancelled. If it's still queued this stops it immediately; if it's actively processing, it stops as soon as the current step finishes checking in (may take a moment).`,
      confirmText: "Stop Job",
      danger: true,
    });
    if (!ok) return;
    try {
      setStoppingId(job._id);
      await stopVideoJob(job._id);
      toast.success(`Stopped "${job.topic}"`);
      invalidateJobs();
    } catch (err) {
      toast.error(err.friendlyMessage || "Failed to stop job");
    } finally {
      setStoppingId(null);
    }
  };

  const handleStopAll = async () => {
    if (active.length === 0) return;
    const ok = await confirmDialog({
      title: "Stop all active jobs?",
      content: `This stops all ${active.length} active job${active.length === 1 ? "" : "s"}. Queued jobs stop immediately; actively processing jobs stop as soon as they next check in.`,
      confirmText: "Stop All",
      danger: true,
    });
    if (!ok) return;
    try {
      setStopAllLoading(true);
      const results = await Promise.allSettled(active.map((j) => stopVideoJob(j._id)));
      const failed = results.filter((r) => r.status === "rejected").length;
      if (failed === 0) {
        toast.success(`Stopped ${active.length} job${active.length === 1 ? "" : "s"}`);
      } else {
        toast.error(`Stopped ${active.length - failed}/${active.length} jobs - ${failed} failed`);
      }
      invalidateJobs();
    } finally {
      setStopAllLoading(false);
    }
  };

  const recent = jobs
    .filter((j) => TERMINAL_STATUSES.includes(j.status))
    .sort((a, b) => new Date(b.updatedAt || b.createdAt) - new Date(a.updatedAt || a.createdAt))
    .slice(0, 6);

  if (loading && jobs.length === 0) {
    return <LoadingState label="Loading render queue…" />;
  }

  return (
    <div>
      <PageHeader
        title="Render Queue"
        description="Everything that is not finished yet, live. Open a job to follow it; stop or restart it from here."
        meta={<ConnectionIndicator />}
        extra={
          <Button variant="secondary" iconOnly aria-label="Refresh render queue" title="Refresh" loading={loading || refreshing} onClick={() => refetch()} icon={<RefreshCw className="size-4" />} />
        }
      />

      {error && jobs.length === 0 && <ErrorState className="mb-4" message="Could not load the render queue" description={error.friendlyMessage || error.message} onRetry={refetch} />}

      <Card className="overflow-hidden">
        <CardHeader
          title="Active jobs"
          subtitle={active.length > 0 ? `${active.length} not finished` : undefined}
          extra={
            active.length > 0 && (
              <>
                <Button variant="secondary" size="sm" icon={<Redo2 className="size-3.5" />} loading={regenerateAllLoading} onClick={handleRegenerateAll}>
                  Regenerate all
                </Button>
                <Button variant="danger" size="sm" icon={<Square className="size-3.5" />} loading={stopAllLoading} onClick={handleStopAll}>
                  Stop all
                </Button>
              </>
            )
          }
        />
        {active.length === 0 ? (
          <EmptyState
            compact
            icon={Rocket}
            title="Nothing is rendering"
            description="Jobs that are queued, running or waiting for you show up here."
            actionLabel="Create Video"
            actionIcon={<Plus className="size-4" />}
            onAction={() => navigate("/wizard")}
          />
        ) : (
          <ul className="divide-y divide-border-light">
            {active.map((job) => {
              const hasScript = job.script?.scenes?.length > 0;
              const stale = staleForMs(job);
              return (
                <li key={job._id} className="flex flex-col gap-3 px-4 py-3 transition-colors hover:bg-surface-hover sm:flex-row sm:items-center sm:gap-4">
                  <div className="min-w-0 flex-1">
                    <Link to={`/render?id=${job._id}`} className="block truncate text-[13px] font-medium text-text-primary hover:text-accent-fg" title={job.topic}>
                      {job.topic}
                    </Link>
                    <p className="mt-0.5 text-xs text-text-tertiary">
                      {typeLabel(job.type)}
                      {job.currentScene ? ` · Scene ${job.currentScene}` : ""}
                      {` · Updated ${timeAgo(job.updatedAt)}`}
                    </p>
                    {stale && (
                      <p className="mt-1 flex items-center gap-1 text-xs text-warning-600 dark:text-warning-500">
                        <AlertTriangle className="size-3.5" /> No update for {formatElapsed(stale)} - the worker may have stopped.
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-3 sm:w-72">
                    <StatusBadge status={job.status} className="shrink-0" />
                    {/* Creep only while the worker is really executing a step - not for jobs waiting on approval/retry/queue. */}
                    <Progress percent={job.progress || 0} size="sm" className="flex-1" status={stale ? "error" : "active"} trickle={isJobRunning(job.status) && !stale} />
                  </div>
                  <div className="flex items-center gap-1 self-end sm:self-auto">
                    {hasScript && (
                      <Button variant="ghost" size="sm" iconOnly aria-label={`Open ${job.topic} in the editor`} title="Open in editor" icon={<Pencil className="size-4" />} onClick={() => navigate(`/studio?id=${job._id}`)} />
                    )}
                    {job.status !== "QUEUED" && (
                      <Button variant="ghost" size="sm" iconOnly aria-label={`Regenerate ${job.topic}`} title="Regenerate" icon={<Redo2 className="size-4" />} loading={regeneratingId === job._id} onClick={(e) => handleRegenerate(job, e)} />
                    )}
                    <Button variant="ghost" size="sm" iconOnly aria-label={`Stop ${job.topic}`} title="Stop" icon={<Square className="size-4 text-danger-500" />} loading={stoppingId === job._id} onClick={(e) => handleStop(job, e)} />
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      {recent.length > 0 && (
        <Card className="mt-4 overflow-hidden">
          <CardHeader
            title="Recently finished"
            subtitle="The last few to complete, fail or be stopped"
            extra={
              <Button variant="secondary" size="sm" icon={<Film className="size-3.5" />} onClick={() => navigate("/editor/complete")}>
                All completed videos
              </Button>
            }
          />
          <ul className="divide-y divide-border-light">
            {recent.map((job) => (
              <li key={job._id} className="flex items-center gap-3 px-4 py-2.5 transition-colors hover:bg-surface-hover">
                <Link to={`/render?id=${job._id}`} className="min-w-0 flex-1 truncate text-[13px] font-medium text-text-primary hover:text-accent-fg" title={job.topic}>
                  {job.topic}
                </Link>
                <StatusBadge status={job.status} className="shrink-0" />
                <span className="hidden w-20 shrink-0 text-right text-xs text-text-tertiary sm:block" title={job.updatedAt ? new Date(job.updatedAt).toLocaleString() : undefined}>
                  {timeAgo(job.updatedAt)}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
};

export default RenderQueue;
