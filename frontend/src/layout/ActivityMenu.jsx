import { Link } from "react-router-dom";
import { Activity, ArrowRight } from "lucide-react";
import { Dropdown, DropdownDivider, DropdownLabel } from "../components/ui/Dropdown";
import { Progress } from "../components/ui/Progress";
import { cn } from "../components/ui/cn";
import { useActiveJobs } from "../lib/useActiveJobs";
import { humanizeStatus } from "../lib/format";

const Row = ({ job, close }) => (
  <Link
    to={`/render?id=${job._id}`}
    role="menuitem"
    onClick={close}
    className="block rounded-md px-2.5 py-2 outline-none transition-colors hover:bg-surface-hover focus-visible:bg-surface-hover"
  >
    <p className="truncate text-[13px] font-medium text-text-primary">{job.topic}</p>
    <div className="mt-1 flex items-center gap-2">
      <span className="shrink-0 text-[11px] text-text-tertiary">{humanizeStatus(job.status)}</span>
      {Number.isFinite(job.progress) && (
        <Progress percent={job.progress} size="sm" showLabel={false} className="flex-1" />
      )}
    </div>
  </Link>
);

/**
 * Top-bar activity button: how many video jobs are running or queued, with
 * the live list one click away. Everything shown is read from the jobs feed -
 * nothing is hard-coded - and an idle system says so instead of showing a
 * badge.
 */
const ActivityMenu = () => {
  const { running, queued, waiting, loading } = useActiveJobs();
  const busy = running.length + queued.length;

  return (
    <Dropdown
      align="end"
      panelClassName="w-80 max-w-[calc(100vw-1.5rem)]"
      trigger={({ toggle, open, id }) => (
        <button
          type="button"
          onClick={toggle}
          aria-haspopup="menu"
          aria-expanded={open}
          aria-controls={open ? id : undefined}
          aria-label={busy > 0 ? `Activity: ${busy} job${busy === 1 ? "" : "s"} in progress` : "Activity: idle"}
          className={cn(
            "relative flex h-9 items-center gap-1.5 rounded-lg px-2.5 text-text-secondary transition-colors hover:bg-surface-hover hover:text-text-primary",
            open && "bg-surface-hover text-text-primary"
          )}
        >
          <Activity className={cn("size-[18px]", running.length > 0 && "text-accent-fg")} />
          {busy > 0 && <span className="tabular text-xs font-semibold text-text-primary">{busy}</span>}
        </button>
      )}
    >
      {({ close }) => (
        <>
          <DropdownLabel>Running now</DropdownLabel>
          {loading ? (
            <p className="px-2.5 py-2 text-xs text-text-tertiary">Loading…</p>
          ) : running.length + queued.length === 0 ? (
            <p className="px-2.5 py-2 text-xs text-text-tertiary">Nothing is running or queued.</p>
          ) : (
            <div className="max-h-72 overflow-y-auto">
              {[...running, ...queued].slice(0, 8).map((job) => (
                <Row key={job._id} job={job} close={close} />
              ))}
            </div>
          )}
          {waiting.length > 0 && (
            <>
              <DropdownDivider />
              <p className="px-2.5 py-1.5 text-xs text-text-tertiary">
                {waiting.length} job{waiting.length === 1 ? " is" : "s are"} paused between stages.
              </p>
            </>
          )}
          <DropdownDivider />
          <Link
            to="/jobs"
            role="menuitem"
            onClick={close}
            className="flex items-center justify-between rounded-md px-2.5 py-2 text-[13px] font-medium text-text-secondary outline-none transition-colors hover:bg-surface-hover hover:text-text-primary focus-visible:bg-surface-hover"
          >
            All generation jobs
            <ArrowRight className="size-3.5" />
          </Link>
        </>
      )}
    </Dropdown>
  );
};

export default ActivityMenu;
