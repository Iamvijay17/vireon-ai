import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Square, Redo2, Trash2, ChevronLeft, ChevronRight } from "lucide-react";
import { useJobs } from "../../lib/useJobs";
import { PageHeader, LoadingState, EmptyState } from "../../components";
import { Card } from "../../components/ui/Card";
import { Table } from "../../components/ui/Table";
import { Button } from "../../components/ui/Button";
import { toast } from "../../components/ui/toastBus";
import { classifyStatus } from "../../lib/statusTone";
import { useDebouncedValue, SEARCH_DEBOUNCE_MS } from "../../lib/useDebouncedValue";
import { rowKeyOf } from "./constants";
import { useJobActions } from "./useJobActions";
import { buildJobColumns } from "./jobColumns";
import { JobFilters } from "./JobFilters";
import { JobDetailModal } from "./JobDetailModal";

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
  const [detailJob, setDetailJob] = useState(null);

  // The input stays bound to `search` (instant typing); only the query key uses
  // the debounced copy, so a server request goes out when typing pauses
  // rather than on every keystroke.
  const debouncedSearch = useDebouncedValue(search, SEARCH_DEBOUNCE_MS);
  const filters = useMemo(
    () => ({ type: typeFilter || undefined, search: debouncedSearch || undefined }),
    [typeFilter, debouncedSearch]
  );

  const { jobs, pagination, loading, refreshing, error, refetch } = useJobs({
    page,
    limit: PAGE_SIZE,
    filters,
    // The safety net runs only while something is actually processing.
    isActive: (job) => classifyStatus(job.status) === "processing",
    activePollMs: ACTIVE_POLL_MS,
  });

  const filtered = useMemo(() => {
    if (statusFilter === "all") return jobs;
    return jobs.filter((j) => classifyStatus(j.status) === statusFilter);
  }, [jobs, statusFilter]);

  // Keyed on the error object so a persistent failure toasts once per
  // failed fetch, not once per re-render.
  useEffect(() => {
    if (error) toast.error(error.friendlyMessage || "Failed to load jobs");
  }, [error]);

  const clearSelection = () => setSelectedIds(new Set());

  const goToPage = (next) => {
    setPage(next);
    clearSelection();
  };

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
  const actions = useJobActions({ selectedJobs, clearSelection });

  const totalPages = pagination.pages || 1;

  const columns = buildJobColumns({
    selectedIds,
    toggleSelect,
    rowActionKey: actions.rowActionKey,
    navigate,
    onCancel: actions.handleCancel,
    onRetry: actions.handleRetry,
    onDelete: actions.handleDelete,
  });

  return (
    <div>
      <PageHeader
        title="Job Management"
        description="Every video job, course, and audio generation in one place - filter, cancel, retry, and drill into details."
      />

      <JobFilters
        search={search}
        onSearch={setSearch}
        typeFilter={typeFilter}
        onTypeFilter={setTypeFilter}
        statusFilter={statusFilter}
        onStatusFilter={setStatusFilter}
        refreshing={loading || refreshing}
        onRefresh={() => refetch()}
      />

      {selectedIds.size > 0 && (
        <Card className="mb-4 flex flex-wrap items-center gap-3 p-3">
          <span className="text-[13px] font-semibold text-text-primary">{selectedIds.size} selected</span>
          <Button variant="ghost" size="sm" onClick={clearSelection}>
            Clear
          </Button>
          <div className="flex flex-wrap items-center gap-2 sm:ml-auto">
            <Button variant="secondary" size="sm" icon={<Square className="size-3.5" />} loading={actions.bulkLoading} onClick={() => actions.handleBulkAction("cancel")}>
              Cancel Selected
            </Button>
            <Button variant="secondary" size="sm" icon={<Redo2 className="size-3.5" />} loading={actions.bulkLoading} onClick={() => actions.handleBulkAction("retry")}>
              Retry Selected
            </Button>
            <Button variant="danger" size="sm" icon={<Trash2 className="size-3.5" />} loading={actions.bulkLoading} onClick={() => actions.handleBulkAction("delete")}>
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
            onRowClick={setDetailJob}
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

      <JobDetailModal job={detailJob} onClose={() => setDetailJob(null)} navigate={navigate} />
    </div>
  );
};

export default JobsPage;
