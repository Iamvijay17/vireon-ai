import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Plus, RefreshCw, Rocket, Eye, CheckCircle2, XCircle, Film, Redo2, Pencil, Square, CircleSlash } from "lucide-react";
import { getVideoJobs, restartVideoJob, stopVideoJob } from "../../services/api";
import { LoadingState, EmptyState, StatusTag } from "../../components";
import { Card, CardHeader } from "../../components/ui/Card";
import { Button } from "../../components/ui/Button";
import { Progress } from "../../components/ui/Progress";
import { Badge } from "../../components/ui/Badge";
import { toast } from "../../components/ui/toastBus";
import { confirmDialog } from "../../components/ui/confirmBus";

const TERMINAL_STATUSES = ["COMPLETED", "FAILED", "CANCELLED"];
const POLL_MS = 5000;

/**
 * Landing view for /render with no job id (the sidebar "Render" link never
 * carries one). Shows the live render queue instead of a dead end, and
 * polls while anything is actively rendering - job progress is only pushed
 * to sockets that joined that job's room (see SocketService.emitJobProgress),
 * so a page that hasn't opened any single job isn't a valid socket listener.
 */
const RenderQueue = () => {
  const navigate = useNavigate();
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [regeneratingId, setRegeneratingId] = useState(null);
  const [regenerateAllLoading, setRegenerateAllLoading] = useState(false);
  const [stoppingId, setStoppingId] = useState(null);
  const [stopAllLoading, setStopAllLoading] = useState(false);
  const intervalRef = useRef(null);

  const fetchJobs = async (silent = false) => {
    try {
      if (!silent) setLoading(true);
      const res = await getVideoJobs(1, 100);
      setJobs(res.data.jobs || []);
    } catch (err) {
      if (!silent) toast.error(err.friendlyMessage || "Failed to load render queue");
    } finally {
      if (!silent) setLoading(false);
    }
  };

  useEffect(() => {
    fetchJobs();
    return () => clearInterval(intervalRef.current);
  }, []);

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
      fetchJobs(true);
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
      fetchJobs(true);
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
      fetchJobs(true);
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
      fetchJobs(true);
    } finally {
      setStopAllLoading(false);
    }
  };

  const recent = jobs
    .filter((j) => TERMINAL_STATUSES.includes(j.status))
    .sort((a, b) => new Date(b.updatedAt || b.createdAt) - new Date(a.updatedAt || a.createdAt))
    .slice(0, 6);

  // Keep the queue live while something is actually rendering, without
  // relying on per-job socket rooms this page never joins.
  useEffect(() => {
    clearInterval(intervalRef.current);
    if (active.length > 0) {
      intervalRef.current = setInterval(() => fetchJobs(true), POLL_MS);
    }
    return () => clearInterval(intervalRef.current);
  }, [active.length]);

  if (loading && jobs.length === 0) {
    return <LoadingState label="Loading render queue..." />;
  }

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-text-primary">Render Queue</h1>
          <p className="mt-1 text-sm text-text-secondary">
            Live status of everything currently rendering, updated automatically.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="secondary" size="sm" loading={loading} onClick={() => fetchJobs()} icon={<RefreshCw className="size-4" />}>
            Refresh
          </Button>
          <Button variant="primary" size="lg" icon={<Plus className="size-4" />} onClick={() => navigate("/wizard")}>
            Create Video
          </Button>
        </div>
      </div>

      <Card className="animate-slide-up">
        <CardHeader
          title="Active Renders"
          subtitle={active.length > 0 ? `${active.length} job${active.length === 1 ? "" : "s"} in progress` : undefined}
          extra={
            active.length > 0 && (
              <div className="flex items-center gap-2">
                <Badge variant="accent" icon={<RefreshCw className="size-3 animate-spin" />}>Live</Badge>
                <Button
                  variant="secondary"
                  size="sm"
                  icon={<Redo2 className="size-4" />}
                  loading={regenerateAllLoading}
                  onClick={handleRegenerateAll}
                >
                  Regenerate All
                </Button>
                <Button
                  variant="danger"
                  size="sm"
                  icon={<Square className="size-4" />}
                  loading={stopAllLoading}
                  onClick={handleStopAll}
                >
                  Stop All
                </Button>
              </div>
            )
          }
        />
        <div className="p-2">
          {active.length === 0 ? (
            <EmptyState
              description="Nothing is rendering right now."
              actionLabel="Create Video"
              actionIcon={<Rocket className="size-4" />}
              onAction={() => navigate("/wizard")}
            />
          ) : (
            <div className="divide-y divide-border-light">
              {active.map((job) => {
                const hasScript = job.script?.scenes?.length > 0;
                return (
                  <div
                    key={job._id}
                    className="flex w-full flex-col gap-3 px-3 py-3.5 transition-colors hover:bg-surface-hover sm:flex-row sm:items-center sm:gap-4"
                  >
                    <button
                      type="button"
                      onClick={() => navigate(`/render?id=${job._id}`)}
                      className="flex min-w-0 flex-1 flex-col gap-3 text-left sm:flex-row sm:items-center sm:gap-4"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="truncate text-[13px] font-medium text-text-primary">{job.topic}</p>
                          <Badge variant="neutral">{job.type}</Badge>
                        </div>
                        <p className="mt-1 text-xs text-text-tertiary">
                          {(job.currentStep || job.status || "").replace(/_/g, " ")}
                          {job.currentScene ? ` · Scene ${job.currentScene}` : ""}
                        </p>
                      </div>
                      <div className="flex items-center gap-3 sm:w-64">
                        <StatusTag status={job.status} />
                        <Progress percent={job.progress || 0} size="sm" className="flex-1" />
                      </div>
                    </button>
                    <div className="flex items-center gap-1.5 self-end sm:self-auto">
                      {hasScript && (
                        <Button
                          variant="ghost"
                          size="sm"
                          iconOnly
                          icon={<Pencil className="size-4" />}
                          title="Open in Studio"
                          onClick={(e) => {
                            e.stopPropagation();
                            navigate(`/studio?id=${job._id}`);
                          }}
                        />
                      )}
                      {job.status !== "QUEUED" && (
                        <Button
                          variant="ghost"
                          size="sm"
                          iconOnly
                          icon={<Redo2 className="size-4" />}
                          title="Regenerate"
                          loading={regeneratingId === job._id}
                          onClick={(e) => handleRegenerate(job, e)}
                        />
                      )}
                      <Button
                        variant="ghost"
                        size="sm"
                        iconOnly
                        icon={<Square className="size-4 text-danger-500" />}
                        title="Stop"
                        loading={stoppingId === job._id}
                        onClick={(e) => handleStop(job, e)}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </Card>

      {recent.length > 0 && (
        <Card className="mt-6 animate-slide-up" style={{ "--stagger-index": 1 }}>
          <CardHeader title="Recently Finished" subtitle="Last few jobs to complete or fail" />
          <div className="p-2">
            <div className="divide-y divide-border-light">
              {recent.map((job) => {
                const isComplete = job.status === "COMPLETED";
                const isCancelled = job.status === "CANCELLED";
                return (
                  <button
                    key={job._id}
                    type="button"
                    onClick={() => navigate(`/render?id=${job._id}`)}
                    className="flex w-full items-center gap-3 px-3 py-3 text-left transition-colors hover:bg-surface-hover"
                  >
                    <div
                      className={`flex size-8 shrink-0 items-center justify-center rounded-lg ${
                        isComplete
                          ? "bg-success-500/10 text-success-600 dark:text-success-500"
                          : isCancelled
                            ? "bg-neutral-500/10 text-text-tertiary"
                            : "bg-danger-500/10 text-danger-600 dark:text-danger-500"
                      }`}
                    >
                      {isComplete ? <CheckCircle2 className="size-4" /> : isCancelled ? <CircleSlash className="size-4" /> : <XCircle className="size-4" />}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[13px] font-medium text-text-primary">{job.topic}</p>
                      <p className="text-xs text-text-tertiary">
                        {job.updatedAt ? new Date(job.updatedAt).toLocaleString() : "—"}
                      </p>
                    </div>
                    <Eye className="size-4 shrink-0 text-text-tertiary" aria-hidden="true" />
                  </button>
                );
              })}
            </div>
            <div className="flex justify-end border-t border-border-light px-3 py-3">
              <Button variant="secondary" size="sm" icon={<Film className="size-4" />} onClick={() => navigate("/editor/complete")}>
                View all completed videos
              </Button>
            </div>
          </div>
        </Card>
      )}
    </div>
  );
};

export default RenderQueue;
