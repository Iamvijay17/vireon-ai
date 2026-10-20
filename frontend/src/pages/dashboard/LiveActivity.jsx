import { Link } from "react-router-dom";
import { Activity, ArrowRight, Plus } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Card, CardHeader } from "../../components/ui/Card";
import { Skeleton } from "../../components/ui/Skeleton";
import ConnectionIndicator from "../../components/ConnectionIndicator";
import JobStatusPanel from "../../components/JobStatusPanel";
import EmptyState from "../../components/EmptyState";
import { useActiveJobs } from "../../lib/useActiveJobs";
import { videoToProject } from "../../lib/projectModel";

/** Jobs the pipeline is working on or has queued right now, with live progress. */
const LiveActivity = () => {
  const navigate = useNavigate();
  const { running, queued, waiting, loading, error } = useActiveJobs();
  const active = [...running, ...queued].map(videoToProject);

  return (
    <Card className="flex flex-col overflow-hidden">
      <CardHeader
        title={
          <span className="flex items-center gap-2">
            <Activity className="size-4 text-text-tertiary" /> Live activity
          </span>
        }
        subtitle={
          loading
            ? undefined
            : `${running.length} running · ${queued.length} queued${waiting.length ? ` · ${waiting.length} paused between stages` : ""}`
        }
        extra={<ConnectionIndicator />}
      />

      {loading ? (
        <div className="space-y-4 p-4" aria-hidden="true">
          <Skeleton className="h-4 w-2/3" />
          <Skeleton className="h-1.5 w-full" />
          <Skeleton className="h-4 w-1/2" />
        </div>
      ) : error ? (
        <p className="p-4 text-[13px] text-danger-500">Live activity could not be loaded: {error.friendlyMessage || error.message}</p>
      ) : active.length === 0 ? (
        <EmptyState
          compact
          icon={Activity}
          title="Nothing is running"
          description={waiting.length ? "Some jobs are paused between stages and need you to continue them." : "Start a video and its progress shows up here, live."}
          actionLabel="Create Video"
          actionIcon={<Plus className="size-4" />}
          onAction={() => navigate("/wizard")}
        />
      ) : (
        <div className="divide-y divide-border-light">
          {active.slice(0, 5).map((project) => (
            <JobStatusPanel key={project.key} project={project} />
          ))}
        </div>
      )}

      {!loading && !error && active.length > 0 && (
        <Link
          to="/jobs"
          className="flex items-center justify-between border-t border-border-light px-4 py-2.5 text-xs font-medium text-text-secondary transition-colors hover:text-text-primary"
        >
          {active.length > 5 ? `${active.length - 5} more · ` : ""}All generation jobs
          <ArrowRight className="size-3.5" />
        </Link>
      )}
    </Card>
  );
};

export default LiveActivity;
