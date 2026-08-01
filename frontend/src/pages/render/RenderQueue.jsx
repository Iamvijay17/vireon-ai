import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Plus, RefreshCw, Rocket, Eye, CheckCircle2, XCircle, Film } from "lucide-react";
import { getVideoJobs } from "../../services/api";
import { LoadingState, EmptyState, StatusTag } from "../../components";
import { Card, CardHeader } from "../../components/ui/Card";
import { Button } from "../../components/ui/Button";
import { Progress } from "../../components/ui/Progress";
import { Badge } from "../../components/ui/Badge";
import { toast } from "../../components/ui/toastBus";

const TERMINAL_STATUSES = ["COMPLETED", "FAILED"];
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
  const intervalRef = useRef(null);

  const fetchJobs = async (silent = false) => {
    try {
      if (!silent) setLoading(true);
      const res = await getVideoJobs(1, 100);
      setJobs(res.data.jobs || []);
    } catch (err) {
      if (!silent) toast.error(err.response?.data?.error || "Failed to load render queue");
    } finally {
      if (!silent) setLoading(false);
    }
  };

  useEffect(() => {
    fetchJobs();
    return () => clearInterval(intervalRef.current);
  }, []);

  const active = jobs.filter((j) => !TERMINAL_STATUSES.includes(j.status));
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
          extra={active.length > 0 && <Badge variant="accent" icon={<RefreshCw className="size-3 animate-spin" />}>Live</Badge>}
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
              {active.map((job) => (
                <button
                  key={job._id}
                  type="button"
                  onClick={() => navigate(`/render?id=${job._id}`)}
                  className="flex w-full flex-col gap-3 px-3 py-3.5 text-left transition-colors hover:bg-surface-hover sm:flex-row sm:items-center sm:gap-4"
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
              ))}
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
                          : "bg-danger-500/10 text-danger-600 dark:text-danger-500"
                      }`}
                    >
                      {isComplete ? <CheckCircle2 className="size-4" /> : <XCircle className="size-4" />}
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
