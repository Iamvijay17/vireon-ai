import { useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { ListChecks, Redo2, Square, Trash2 } from "lucide-react";
import { useJobs } from "../../lib/useJobs";
import { PageHeader, EmptyState } from "../../components";
import DataTable from "../../components/DataTable";
import FilterBar from "../../components/FilterBar";
import ConnectionIndicator from "../../components/ConnectionIndicator";
import { Alert } from "../../components/ui/Alert";
import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import { Select } from "../../components/ui/Select";
import { SearchInput } from "../../components/ui/SearchInput";
import { SegmentedControl } from "../../components/ui/SegmentedControl";
import { jobPhase } from "../../lib/jobStatus";
import { useSocketStatus } from "../../lib/useSocketStatus";
import { useDebouncedValue, SEARCH_DEBOUNCE_MS } from "../../lib/useDebouncedValue";
import { rowKeyOf, TYPE_OPTIONS, STATUS_FILTERS, matchesStatusFilter } from "./constants";
import { useJobActions } from "./useJobActions";
import { buildJobColumns } from "./jobColumns";
import { JobDetailModal } from "./JobDetailModal";
import { JobsSummary } from "./JobsSummary";

const PAGE_SIZE = 20;
// Safety net only. Socket events invalidate this page's query (see
// lib/useSocketQuerySync.js); this covers the gap when an event is missed,
// and useJobs disables it entirely when nothing is actively processing.
const ACTIVE_POLL_MS = 10000;

const VALID_STATUS = new Set(STATUS_FILTERS.map((f) => f.value));
// Links made before the filters were regrouped (?status=error, ...) keep working.
const LEGACY_STATUS = { processing: "active", success: "completed", error: "failed" };

/**
 * Generation Jobs: every video job, course and Voice Studio generation in one
 * list - filter, cancel, retry, delete and drill into what happened. Actions
 * are offered only where the backend says the job supports them, and the page
 * says so when live updates are not arriving instead of leaving stale bars.
 */
const JobsPage = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [page, setPage] = useState(1);
  const [typeFilter, setTypeFilter] = useState("");
  const [search, setSearch] = useState("");
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [detailJob, setDetailJob] = useState(null);
  const socketStatus = useSocketStatus();

  // The status filter lives in the URL so a tile elsewhere ("3 failed") can
  // link straight to it, and the browser's back button undoes a filter.
  const rawStatus = searchParams.get("status");
  const urlStatus = LEGACY_STATUS[rawStatus] || rawStatus;
  const statusFilter = VALID_STATUS.has(urlStatus) ? urlStatus : "all";
  const setStatusFilter = (value) => {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (value === "all") next.delete("status");
        else next.set("status", value);
        return next;
      },
      { replace: true }
    );
    setSelectedIds(new Set());
  };

  // The input stays bound to `search` (instant typing); only the query key uses
  // the debounced copy, so a server request goes out when typing pauses.
  const debouncedSearch = useDebouncedValue(search.trim(), SEARCH_DEBOUNCE_MS);
  const filters = useMemo(() => ({ type: typeFilter || undefined, search: debouncedSearch || undefined }), [typeFilter, debouncedSearch]);

  const { jobs, pagination, loading, refreshing, error, refetch } = useJobs({
    page,
    limit: PAGE_SIZE,
    filters,
    // The safety net runs only while something is actually processing.
    isActive: (job) => ["running", "queued"].includes(jobPhase(job.status)),
    activePollMs: ACTIVE_POLL_MS,
  });

  const filtered = useMemo(() => jobs.filter((j) => matchesStatusFilter(j, statusFilter, jobPhase)), [jobs, statusFilter]);

  // Counts are for the page on screen (the server filters by type and search,
  // not by this status grouping), and labelled that way below.
  const counts = useMemo(() => {
    const by = { all: jobs.length };
    for (const f of STATUS_FILTERS) if (f.value !== "all") by[f.value] = jobs.filter((j) => matchesStatusFilter(j, f.value, jobPhase)).length;
    return by;
  }, [jobs]);

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

  const allSelected = filtered.length > 0 && selectedIds.size === filtered.length;
  const toggleSelectAll = () => setSelectedIds(allSelected ? new Set() : new Set(filtered.map(rowKeyOf)));

  const selectedJobs = filtered.filter((j) => selectedIds.has(rowKeyOf(j)));
  const actions = useJobActions({ selectedJobs, clearSelection });

  const columns = buildJobColumns({
    selectedIds,
    toggleSelect,
    rowActionKey: actions.rowActionKey,
    navigate,
    onCancel: actions.handleCancel,
    onRetry: actions.handleRetry,
    onDelete: actions.handleDelete,
  });

  const filtersActive = Boolean(typeFilter || debouncedSearch || statusFilter !== "all");
  const clearFilters = () => {
    setTypeFilter("");
    setSearch("");
    setStatusFilter("all");
    setPage(1);
  };

  const hasRunning = jobs.some((j) => ["running", "queued"].includes(jobPhase(j.status)));

  return (
    <div>
      <PageHeader
        title="Generation Jobs"
        description="Every video, course and voice generation. Filter, stop, retry, or open a job to see what happened and where it stopped."
        meta={<ConnectionIndicator />}
      />

      {socketStatus !== "connected" && (
        <Alert type="warning" className="mb-4" title={socketStatus === "reconnecting" ? "Live updates are reconnecting" : "Live updates are off"}>
          Progress shown here may be out of date{hasRunning ? ". This list refreshes itself every few seconds while jobs are running" : ""}.
        </Alert>
      )}

      <JobsSummary onFilter={setStatusFilter} />

      <FilterBar
        search={<SearchInput value={search} onChange={(v) => { setSearch(v); setPage(1); }} placeholder="Search jobs by title" />}
        onRefresh={() => refetch()}
        refreshing={refreshing}
        refreshLabel="Refresh jobs"
      >
        <SegmentedControl
          aria-label="Filter by status"
          value={statusFilter}
          onChange={setStatusFilter}
          options={STATUS_FILTERS.map((f) => ({ ...f, count: loading ? undefined : counts[f.value] }))}
        />
        <Select aria-label="Filter by type" className="w-40" value={typeFilter} onChange={(v) => { setTypeFilter(v); setPage(1); }} options={TYPE_OPTIONS} />
      </FilterBar>

      {selectedIds.size > 0 && (
        <Card className="mb-3 flex flex-wrap items-center gap-3 p-3" role="region" aria-label="Bulk actions">
          <span className="text-[13px] font-semibold text-text-primary">{selectedIds.size} selected</span>
          <Button variant="ghost" size="sm" onClick={clearSelection}>
            Clear
          </Button>
          <div className="flex flex-wrap items-center gap-2 sm:ml-auto">
            <Button variant="secondary" size="sm" icon={<Square className="size-3.5" />} loading={actions.bulkLoading} onClick={() => actions.handleBulkAction("cancel")}>
              Cancel selected
            </Button>
            <Button variant="secondary" size="sm" icon={<Redo2 className="size-3.5" />} loading={actions.bulkLoading} onClick={() => actions.handleBulkAction("retry")}>
              Retry selected
            </Button>
            <Button variant="danger" size="sm" icon={<Trash2 className="size-3.5" />} loading={actions.bulkLoading} onClick={() => actions.handleBulkAction("delete")}>
              Delete selected…
            </Button>
          </div>
        </Card>
      )}

      <DataTable
        columns={columns}
        data={filtered.map((j) => ({ ...j, _rowKey: rowKeyOf(j) }))}
        rowKey="_rowKey"
        loading={loading}
        error={error}
        onRetry={() => refetch()}
        onRowClick={setDetailJob}
        header={
          filtered.length > 0 && (
            <div className="flex items-center gap-3 border-b border-border-light px-4 py-2">
              <input type="checkbox" className="size-4 shrink-0 cursor-pointer accent-accent" aria-label="Select all jobs on this page" checked={allSelected} onChange={toggleSelectAll} />
              <span className="text-xs text-text-tertiary">
                {pagination.total} job{pagination.total === 1 ? "" : "s"}
                {statusFilter !== "all" && ` · ${filtered.length} on this page match "${STATUS_FILTERS.find((f) => f.value === statusFilter)?.label}"`}
              </span>
            </div>
          )
        }
        pagination={{ page: pagination.page, pages: pagination.pages || 1, total: pagination.total, onChange: goToPage }}
        empty={
          <EmptyState
            compact
            icon={ListChecks}
            title={filtersActive ? "No jobs match" : "No jobs yet"}
            description={filtersActive ? "Nothing on this page matches the filters. Other pages may." : "Jobs appear here as soon as you create a video, a course or a voice generation."}
            actionLabel={filtersActive ? "Clear filters" : "Create Video"}
            onAction={filtersActive ? clearFilters : () => navigate("/wizard")}
          />
        }
      />

      <JobDetailModal job={detailJob} onClose={() => setDetailJob(null)} navigate={navigate} />
    </div>
  );
};

export default JobsPage;
