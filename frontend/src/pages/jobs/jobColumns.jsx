import { AlertTriangle, MoreVertical, Redo2, Square, Trash2, ExternalLink } from "lucide-react";
import StatusBadge from "../../components/StatusBadge";
import { Button } from "../../components/ui/Button";
import { Badge } from "../../components/ui/Badge";
import { Progress } from "../../components/ui/Progress";
import { Dropdown, DropdownItem, DropdownDivider } from "../../components/ui/Dropdown";
import { staleForMs, isJobRunning } from "../../lib/jobStatus";
import { formatElapsed } from "../../lib/format";
import { timeAgo } from "../../lib/timeAgo";
import { TYPE_BADGE, ROUTE_FOR, rowKeyOf } from "./constants";

/**
 * Columns for the jobs table. The row menu only offers what the backend says
 * the job supports (`job.capabilities`), and clicks inside the checkbox and
 * menu don't bubble up to the row (which opens the detail modal).
 *
 * Progress is shown only when the job reports one; a running job that has gone
 * quiet is flagged instead of leaving its bar at a frozen percentage.
 */
export function buildJobColumns({ selectedIds, toggleSelect, rowActionKey, navigate, onCancel, onRetry, onDelete }) {
  const menuItem = (close, action) => () => {
    close();
    action();
  };

  return [
    {
      key: "select",
      title: "",
      width: 36,
      render: (job) => (
        <input
          type="checkbox"
          className="size-4 shrink-0 cursor-pointer accent-accent"
          aria-label={`Select ${job.title}`}
          checked={selectedIds.has(rowKeyOf(job))}
          onClick={(e) => e.stopPropagation()}
          onChange={() => toggleSelect(job)}
        />
      ),
    },
    {
      key: "title",
      title: "Job",
      render: (job) => (
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <Badge variant={TYPE_BADGE[job.type].variant}>{TYPE_BADGE[job.type].label}</Badge>
            <span className="block max-w-xs truncate text-[13px] font-medium text-text-primary" title={job.title}>
              {job.title}
            </span>
          </div>
          {job.error && (
            <p className="mt-1 line-clamp-1 max-w-md text-xs text-danger-500" title={job.error}>
              {job.error}
            </p>
          )}
        </div>
      ),
    },
    {
      key: "status",
      title: "Status",
      width: 170,
      render: (job) => <StatusBadge status={job.status} />,
    },
    {
      key: "progress",
      title: "Progress",
      width: 170,
      render: (job) => {
        const stale = job.type === "video" ? staleForMs(job) : null;
        if (stale) {
          return (
            <span className="inline-flex items-center gap-1 text-xs text-warning-600 dark:text-warning-500" title="A running job normally updates every few seconds. The worker may have stopped.">
              <AlertTriangle className="size-3.5" /> No update for {formatElapsed(stale)}
            </span>
          );
        }
        return job.progress > 0 && job.progress < 100 ? (
          <Progress percent={job.progress} size="sm" status="active" trickle={job.type === "video" && isJobRunning(job.status)} />
        ) : (
          <span className="text-xs text-text-tertiary">—</span>
        );
      },
    },
    {
      key: "updatedAt",
      title: "Updated",
      width: 120,
      render: (job) => (
        <span className="text-xs text-text-tertiary" title={job.updatedAt ? new Date(job.updatedAt).toLocaleString() : undefined}>
          {job.updatedAt ? timeAgo(job.updatedAt) : "—"}
        </span>
      ),
    },
    {
      key: "actions",
      title: "",
      align: "right",
      width: 56,
      render: (job) => (
        <div onClick={(e) => e.stopPropagation()}>
          <Dropdown
            trigger={({ toggle, open, id }) => (
              <Button
                variant="ghost"
                size="sm"
                iconOnly
                loading={rowActionKey === rowKeyOf(job)}
                icon={<MoreVertical className="size-4" />}
                onClick={toggle}
                aria-label={`Actions for ${job.title}`}
                aria-haspopup="menu"
                aria-expanded={open}
                aria-controls={open ? id : undefined}
              />
            )}
          >
            {({ close }) => (
              <>
                <DropdownItem icon={<ExternalLink />} onClick={menuItem(close, () => navigate(ROUTE_FOR[job.type](job.id)))}>
                  Open
                </DropdownItem>
                {job.capabilities?.canRetry && (
                  <DropdownItem icon={<Redo2 />} onClick={menuItem(close, () => onRetry(job))}>
                    Retry
                  </DropdownItem>
                )}
                {job.capabilities?.canCancel && (
                  <DropdownItem icon={<Square />} danger onClick={menuItem(close, () => onCancel(job))}>
                    Cancel
                  </DropdownItem>
                )}
                {job.capabilities?.canDelete && <DropdownDivider />}
                {job.capabilities?.canDelete && (
                  <DropdownItem icon={<Trash2 />} danger onClick={menuItem(close, () => onDelete(job))}>
                    Delete…
                  </DropdownItem>
                )}
              </>
            )}
          </Dropdown>
        </div>
      ),
    },
  ];
}
