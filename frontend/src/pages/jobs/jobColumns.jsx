import { Eye, Square, Redo2, Trash2, MoreVertical } from "lucide-react";
import { StatusTag } from "../../components";
import { Button } from "../../components/ui/Button";
import { Badge } from "../../components/ui/Badge";
import { Progress } from "../../components/ui/Progress";
import { Dropdown, DropdownItem } from "../../components/ui/Dropdown";
import { TYPE_BADGE, ROUTE_FOR, rowKeyOf } from "./constants";

/**
 * Columns for the jobs table. The row menu only offers what the backend says
 * the job supports (`job.capabilities`), and clicks inside the checkbox and
 * menu don't bubble up to the row (which opens the detail modal).
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
      key: "type",
      title: "Type",
      width: 90,
      render: (job) => <Badge variant={TYPE_BADGE[job.type].variant}>{TYPE_BADGE[job.type].label}</Badge>,
    },
    {
      key: "title",
      title: "Title",
      render: (job) => <span className="block max-w-xs truncate text-[13px] font-medium text-text-primary">{job.title}</span>,
    },
    {
      key: "status",
      title: "Status",
      render: (job) => <StatusTag status={job.status} />,
    },
    {
      key: "progress",
      title: "Progress",
      width: 140,
      render: (job) =>
        job.progress > 0 && job.progress < 100 ? (
          <Progress percent={job.progress} size="sm" status="active" />
        ) : (
          <span className="text-xs text-text-tertiary">—</span>
        ),
    },
    {
      key: "updatedAt",
      title: "Updated",
      width: 150,
      render: (job) => <span className="text-xs text-text-tertiary">{job.updatedAt ? new Date(job.updatedAt).toLocaleString() : "—"}</span>,
    },
    {
      key: "actions",
      title: "",
      align: "right",
      width: 56,
      render: (job) => (
        <div onClick={(e) => e.stopPropagation()}>
          <Dropdown
            trigger={({ toggle }) => (
              <Button
                variant="ghost"
                size="sm"
                iconOnly
                loading={rowActionKey === rowKeyOf(job)}
                icon={<MoreVertical className="size-4" />}
                onClick={toggle}
                aria-label={`Actions for ${job.title}`}
              />
            )}
          >
            {({ close }) => (
              <>
                <DropdownItem icon={<Eye />} onClick={menuItem(close, () => navigate(ROUTE_FOR[job.type](job.id)))}>
                  Open
                </DropdownItem>
                {job.capabilities?.canCancel && (
                  <DropdownItem icon={<Square />} danger onClick={menuItem(close, () => onCancel(job))}>
                    Cancel
                  </DropdownItem>
                )}
                {job.capabilities?.canRetry && (
                  <DropdownItem icon={<Redo2 />} onClick={menuItem(close, () => onRetry(job))}>
                    Retry
                  </DropdownItem>
                )}
                {job.capabilities?.canDelete && (
                  <DropdownItem icon={<Trash2 />} danger onClick={menuItem(close, () => onDelete(job))}>
                    Delete
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
