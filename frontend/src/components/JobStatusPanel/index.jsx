import { Link } from "react-router-dom";
import { AlertTriangle } from "lucide-react";
import StatusBadge from "../StatusBadge";
import { ProgressIndicator } from "../ui/ProgressIndicator";
import { cn } from "../ui/cn";
import { staleForMs, isJobRunning } from "../../lib/jobStatus";
import { formatElapsed } from "../../lib/format";
import { timeAgo } from "../../lib/timeAgo";

/**
 * One job's live state: where it is, how far along, when it last moved, and
 * - if a running job has gone quiet - a plain warning instead of a bar frozen
 * at some percentage.
 *
 * `project` is the normalised shape from lib/projectModel (videoToProject).
 * Progress is shown only when the job reports a number; a job that does not
 * gets an indeterminate bar, never an invented percentage.
 */
const JobStatusPanel = ({ project, className, showProgress = true }) => {
  const stale = staleForMs(project.raw);
  const running = isJobRunning(project.status);
  const active = ["running", "queued"].includes(project.phase);

  return (
    <div className={cn("space-y-2 px-4 py-3", className)}>
      <div className="flex items-start justify-between gap-3">
        <Link
          to={project.route}
          className="min-w-0 truncate text-[13px] font-medium text-text-primary outline-none hover:text-accent-fg focus-visible:text-accent-fg"
          title={project.title}
        >
          {project.title}
        </Link>
        <StatusBadge status={project.status} className="shrink-0" />
      </div>

      {showProgress && active && project.phase === "running" && (
        <ProgressIndicator
          percent={project.progress ?? undefined}
          status={stale ? "error" : "active"}
          trickle={running && !stale}
          detail={project.progress != null ? undefined : "Working…"}
        />
      )}

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-text-tertiary">
        <span>{project.meta.join(" · ")}</span>
        <span title={project.updatedAt ? new Date(project.updatedAt).toLocaleString() : undefined}>Updated {timeAgo(project.updatedAt)}</span>
      </div>

      {stale && (
        <p className="flex items-start gap-1.5 text-xs leading-relaxed text-warning-600 dark:text-warning-500">
          <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
          No update for {formatElapsed(stale)}. The worker may have stopped or live updates may be lost - check Generation Jobs.
        </p>
      )}
      {project.phase === "failed" && project.error && <p className="line-clamp-2 text-xs text-danger-500">{project.error}</p>}
    </div>
  );
};

export default JobStatusPanel;
