import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Search,
  RefreshCw,
  Eye,
  Square,
  Redo2,
  Trash2,
  MoreVertical,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { cancelJob, retryJob, bulkJobAction } from "../../services/api";
import { useJobs, useJobDetail, useInvalidateJobs } from "../../lib/useJobs";
import { PageHeader, LoadingState, EmptyState, StatusTag, JobEventTimeline } from "../../components";
import { useJobEvents } from "../../shared/useJobEvents";
import { Card } from "../../components/ui/Card";
import { Table } from "../../components/ui/Table";
import { Button } from "../../components/ui/Button";
import { Input } from "../../components/ui/Input";
import { Select } from "../../components/ui/Select";
import { Badge } from "../../components/ui/Badge";
import { Progress } from "../../components/ui/Progress";
import { Modal } from "../../components/ui/Modal";
import { Dropdown, DropdownItem } from "../../components/ui/Dropdown";
import { toast } from "../../components/ui/toastBus";
import { confirmDialog } from "../../components/ui/confirmBus";
import { classifyStatus } from "../../lib/statusTone";

const TYPE_OPTIONS = [
  { value: "", label: "All types" },
  { value: "video", label: "Video jobs" },
  { value: "course", label: "Courses" },
  { value: "audio", label: "Audio Studio" },
];

const STATUS_FILTERS = [
  { value: "all", label: "All" },
  { value: "processing", label: "Processing" },
  { value: "success", label: "Completed" },
  { value: "error", label: "Failed" },
  { value: "cancelled", label: "Cancelled" },
];

const TYPE_BADGE = {
  video: { variant: "info", label: "Video" },
  course: { variant: "warning", label: "Course" },
  audio: { variant: "accent", label: "Audio" },
};

const ROUTE_FOR = {
  video: (id) => `/render?id=${id}`,
  course: (id) => `/courses/${id}`,
  audio: () => `/audio`,
};

const PAGE_SIZE = 20;
// Safety net only. Socket events invalidate this page's query (see
// lib/useSocketQuerySync.js); this covers the gap when an event is missed,
// and useJobs disables it entirely when nothing is actively processing.
const ACTIVE_POLL_MS = 10000;

/**
 * Cross-type job management console - lists video jobs, courses, and audio
 * generations together (see backend/src/services/job/jobAggregatorService.js
 * for the normalization), with cancel/retry/delete actions (single + bulk)
 * and a detail drill-down. Dashboard and Projects stay as their own
 * dedicated views - this page is the unified management surface.
 */
const JobsPage = () => {
  const navigate = useNavigate();
  const [page, setPage] = useState(1);
  const [typeFilter, setTypeFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [bulkLoading, setBulkLoading] = useState(false);
  const [rowActionKey, setRowActionKey] = useState(null);
  const [detailJob, setDetailJob] = useState(null);

  const filters = useMemo(
    () => ({ type: typeFilter || undefined, search: search || undefined }),
    [typeFilter, search]
  );

  const { jobs, pagination, loading, refreshing, error, refetch } = useJobs({
    page,
    limit: PAGE_SIZE,
    filters,
    // The safety net runs only while something is actually processing.
    isActive: (job) => classifyStatus(job.status) === "processing",
    activePollMs: ACTIVE_POLL_MS,
  });

  const invalidateJobs = useInvalidateJobs();

  const filtered = useMemo(() => {
    if (statusFilter === "all") return jobs;
    return jobs.filter((j) => classifyStatus(j.status) === statusFilter);
  }, [jobs, statusFilter]);

  // Keyed on the error object so a persistent failure toasts once per
  // failed fetch, not once per re-render.
  useEffect(() => {
    if (error) toast.error(error.friendlyMessage || "Failed to load jobs");
  }, [error]);

  const goToPage = (next) => {
    setPage(next);
    setSelectedIds(new Set());
  };

  const rowKeyOf = (job) => `${job.type}:${job.id}`;

  const toggleSelect = (job) => {
    const key = rowKeyOf(job);
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const toggleSelectAll = () => {
    setSelectedIds((prev) =>
      prev.size === filtered.length ? new Set() : new Set(filtered.map(rowKeyOf))
    );
  };

  const selectedJobs = filtered.filter((j) => selectedIds.has(rowKeyOf(j)));

  // Fetched by the drawer's own query rather than an imperative loader, so
  // a socket event for this job refreshes the open drawer too - the old
  // version only ever showed what was true when it was opened.
  const { detail: fetchedDetail, loading: detailLoading } = useJobDetail(
    detailJob?.type,
    detailJob?.id,
    { enabled: Boolean(detailJob) }
  );

  // Render the clicked row immediately while its full record loads, which
  // is what the old openDetail's optimistic setDetail was doing.
  const detail = fetchedDetail || (detailJob ? { job: detailJob, logs: [], lessons: [] } : null);

  // Only the video pipeline records JobEvents today; other types fall back
  // to the human-readable activity log below.
  const detailHasEvents = detail?.job?.type === "video";
  const { events: detailEvents, loading: detailEventsLoading } = useJobEvents(
    detail?.job?.type,
    detail?.job?.id,
    { enabled: detailHasEvents }
  );

  const openDetail = (job) => setDetailJob(job);

  const handleCancel = async (job) => {
    const ok = await confirmDialog({
      title: "Cancel this job?",
      content: `"${job.title}" will be marked cancelled.`,
      confirmText: "Cancel Job",
      danger: true,
    });
    if (!ok) return;
    setRowActionKey(rowKeyOf(job));
    try {
      await cancelJob(job.type, job.id);
      toast.success(`Cancelled "${job.title}"`);
      invalidateJobs();
    } catch (err) {
      toast.error(err.friendlyMessage || "Failed to cancel job");
    } finally {
      setRowActionKey(null);
    }
  };

  const handleRetry = async (job) => {
    const ok = await confirmDialog({
      title: "Retry this job?",
      content: `"${job.title}" will be re-queued from where it left off.`,
      confirmText: "Retry",
    });
    if (!ok) return;
    setRowActionKey(rowKeyOf(job));
    try {
      await retryJob(job.type, job.id);
      toast.success(`Retried "${job.title}"`);
      invalidateJobs();
    } catch (err) {
      toast.error(err.friendlyMessage || "Failed to retry job");
    } finally {
      setRowActionKey(null);
    }
  };

  const handleDelete = async (job) => {
    const ok = await confirmDialog({
      title: `Delete "${job.title}"?`,
      content: "This can't be undone.",
      confirmText: "Delete",
      danger: true,
    });
    if (!ok) return;
    setRowActionKey(rowKeyOf(job));
    try {
      await bulkJobAction([{ type: job.type, id: job.id }], "delete");
      toast.success(`Deleted "${job.title}"`);
      invalidateJobs();
    } catch (err) {
      toast.error(err.friendlyMessage || "Failed to delete job");
    } finally {
      setRowActionKey(null);
    }
  };

  const handleBulkAction = async (action) => {
    const items = selectedJobs.map((j) => ({ type: j.type, id: j.id }));
    if (items.length === 0) return;

    const label = { cancel: "Cancel", retry: "Retry", delete: "Delete" }[action];
    const ok = await confirmDialog({
      title: `${label} ${items.length} selected job${items.length === 1 ? "" : "s"}?`,
      content:
        action === "delete"
          ? "This can't be undone. Jobs that don't support this action will be skipped."
          : "Jobs that don't support this action will be skipped.",
      confirmText: label,
      danger: action !== "retry",
    });
    if (!ok) return;

    setBulkLoading(true);
    try {
      const res = await bulkJobAction(items, action);
      const { succeeded = [], failed = [] } = res.data;
      if (failed.length === 0) {
        toast.success(`${label}d ${succeeded.length}/${items.length} job${items.length === 1 ? "" : "s"}`);
      } else {
        toast.error(`${label}d ${succeeded.length}/${items.length} jobs - ${failed.length} skipped/failed`);
      }
      invalidateJobs();
      setSelectedIds(new Set());
    } catch (err) {
      toast.error(err.friendlyMessage || `Failed to ${action} jobs`);
    } finally {
      setBulkLoading(false);
    }
  };

  const totalPages = pagination.pages || 1;

  const columns = [
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
                <DropdownItem
                  icon={<Eye />}
                  onClick={() => {
                    close();
                    navigate(ROUTE_FOR[job.type](job.id));
                  }}
                >
                  Open
                </DropdownItem>
                {job.capabilities?.canCancel && (
                  <DropdownItem
                    icon={<Square />}
                    danger
                    onClick={() => {
                      close();
                      handleCancel(job);
                    }}
                  >
                    Cancel
                  </DropdownItem>
                )}
                {job.capabilities?.canRetry && (
                  <DropdownItem
                    icon={<Redo2 />}
                    onClick={() => {
                      close();
                      handleRetry(job);
                    }}
                  >
                    Retry
                  </DropdownItem>
                )}
                {job.capabilities?.canDelete && (
                  <DropdownItem
                    icon={<Trash2 />}
                    danger
                    onClick={() => {
                      close();
                      handleDelete(job);
                    }}
                  >
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

  return (
    <div>
      <PageHeader
        title="Job Management"
        description="Every video job, course, and audio generation in one place - filter, cancel, retry, and drill into details."
      />

      <Card className="mb-4 p-4">
        <div className="flex flex-wrap items-center gap-3">
          <Input
            icon={<Search className="size-4" />}
            placeholder="Search by title..."
            className="min-w-56 flex-1"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <Select value={typeFilter} onChange={setTypeFilter} options={TYPE_OPTIONS} className="w-44" />
          <div className="flex items-center gap-1 rounded-full border border-border bg-surface-hover/50 p-1">
            {STATUS_FILTERS.map((f) => (
              <button
                key={f.value}
                type="button"
                onClick={() => setStatusFilter(f.value)}
                className={`rounded-full px-2.5 py-1 text-xs font-medium transition-colors cursor-pointer ${
                  statusFilter === f.value
                    ? "bg-surface text-text-primary shadow-sm"
                    : "text-text-tertiary hover:text-text-secondary"
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
          <Button
            variant="secondary"
            size="sm"
            iconOnly
            aria-label="Refresh jobs"
            loading={loading || refreshing}
            icon={<RefreshCw className="size-4" />}
            onClick={() => refetch()}
          />
        </div>
      </Card>

      {selectedIds.size > 0 && (
        <Card className="mb-4 flex flex-wrap items-center gap-3 p-3">
          <span className="text-[13px] font-semibold text-text-primary">{selectedIds.size} selected</span>
          <Button variant="ghost" size="sm" onClick={() => setSelectedIds(new Set())}>
            Clear
          </Button>
          <div className="ml-auto flex items-center gap-2">
            <Button variant="secondary" size="sm" icon={<Square className="size-3.5" />} loading={bulkLoading} onClick={() => handleBulkAction("cancel")}>
              Cancel Selected
            </Button>
            <Button variant="secondary" size="sm" icon={<Redo2 className="size-3.5" />} loading={bulkLoading} onClick={() => handleBulkAction("retry")}>
              Retry Selected
            </Button>
            <Button variant="danger" size="sm" icon={<Trash2 className="size-3.5" />} loading={bulkLoading} onClick={() => handleBulkAction("delete")}>
              Delete Selected
            </Button>
          </div>
        </Card>
      )}

      <Card className="overflow-hidden">
        {filtered.length > 0 && (
          <div className="flex items-center gap-3 border-b border-border-light px-4 py-2.5">
            <input
              type="checkbox"
              className="size-4 shrink-0 cursor-pointer accent-accent"
              aria-label="Select all jobs"
              checked={selectedIds.size === filtered.length}
              onChange={toggleSelectAll}
            />
            <span className="text-xs text-text-tertiary">{pagination.total} total</span>
          </div>
        )}

        {loading && jobs.length === 0 ? (
          <LoadingState label="Loading jobs..." />
        ) : filtered.length === 0 ? (
          <EmptyState description="No jobs match your filters." />
        ) : (
          <Table
            columns={columns}
            data={filtered.map((j) => ({ ...j, _rowKey: rowKeyOf(j) }))}
            rowKey="_rowKey"
            onRowClick={openDetail}
          />
        )}

        {totalPages > 1 && (
          <div className="flex items-center justify-end gap-2 border-t border-border-light px-4 py-3">
            <span className="mr-2 text-xs text-text-tertiary">
              Page {pagination.page} of {totalPages}
            </span>
            <Button
              variant="secondary"
              size="sm"
              iconOnly
              disabled={pagination.page <= 1}
              onClick={() => goToPage(pagination.page - 1)}
              icon={<ChevronLeft className="size-4" />}
            />
            <Button
              variant="secondary"
              size="sm"
              iconOnly
              disabled={pagination.page >= totalPages}
              onClick={() => goToPage(pagination.page + 1)}
              icon={<ChevronRight className="size-4" />}
            />
          </div>
        )}
      </Card>

      <Modal open={!!detailJob} onClose={() => setDetailJob(null)} title={detail?.job?.title} width="lg">
        {detailLoading ? (
          <LoadingState label="Loading details..." />
        ) : detail ? (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant={TYPE_BADGE[detail.job.type].variant}>{TYPE_BADGE[detail.job.type].label}</Badge>
              <StatusTag status={detail.job.status} />
              {detail.job.error && <span className="text-xs text-danger-500">{detail.job.error}</span>}
            </div>

            {detail.job.type === "course" ? (
              <div>
                <h4 className="mb-2 text-[13px] font-semibold text-text-primary">Lessons</h4>
                {detail.lessons.length === 0 ? (
                  <p className="text-sm text-text-tertiary">No lessons yet.</p>
                ) : (
                  <div className="max-h-80 divide-y divide-border-light overflow-y-auto">
                    {detail.lessons.map((lesson) => (
                      <div key={lesson._id} className="flex items-center justify-between gap-3 py-2">
                        <span className="truncate text-sm text-text-secondary">{lesson.title}</span>
                        <StatusTag status={lesson.status} />
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ) : detailHasEvents ? (
              <div>
                <h4 className="mb-2 text-[13px] font-semibold text-text-primary">Events</h4>
                <div className="max-h-80 overflow-y-auto pr-1">
                  <JobEventTimeline
                    events={detailEvents}
                    emptyText={detailEventsLoading ? "Loading events..." : "No events recorded yet"}
                  />
                </div>
              </div>
            ) : detail.logs.length > 0 ? (
              <div>
                <h4 className="mb-2 text-[13px] font-semibold text-text-primary">Activity</h4>
                <div className="max-h-80 divide-y divide-border-light overflow-y-auto">
                  {detail.logs.map((log) => (
                    <div key={log._id} className="py-2">
                      <p className="text-sm text-text-secondary">{log.text}</p>
                      <p className="mt-0.5 text-xs text-text-tertiary">{new Date(log.timestamp).toLocaleString()}</p>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <p className="text-sm text-text-tertiary">No activity recorded yet.</p>
            )}

            <div className="flex justify-end border-t border-border-light pt-3">
              <Button variant="secondary" size="sm" onClick={() => navigate(ROUTE_FOR[detail.job.type](detail.job.id))}>
                Open
              </Button>
            </div>
          </div>
        ) : null}
      </Modal>
    </div>
  );
};

export default JobsPage;
