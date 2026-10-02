import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  MoreVertical, Square, Redo2, Trash2, ListChecks, ChevronLeft, ChevronRight,
  RefreshCw, Film, BookOpen, AudioLines,
} from "lucide-react";
import {
  Panel, Button, StatusPill, Progress, Skeleton, Empty, Mono,
} from "../ui/primitives";
import { SearchInput, Select, Segmented, Checkbox, Menu, Table } from "../ui/controls";
import { PipelineTrack } from "../ui/Pipeline";
import { stagesFromStatus } from "../lib/pipelineStages";
import { STATE, stateOf, isRunning } from "../lib/status";
import { useApiQuery, useInvalidate } from "../../lib/useApiQuery";
import { queryKeys } from "../../lib/queryClient";
import { getJobs, cancelJob, retryJob, bulkJobAction } from "../../services/api";
import { timeAgo } from "../../lib/timeAgo";
import { toast } from "../../components/ui/toastBus";
import { confirmDialog } from "../../components/ui/confirmBus";

const PAGE_SIZE = 20;
const EMPTY = [];

// Safety net only - socket events invalidate this query (see
// lib/useSocketQuerySync.js). Runs solely while something is processing.
const ACTIVE_POLL_MS = 10_000;

const TYPE_OPTIONS = [
  { value: "", label: "All types" },
  { value: "video", label: "Videos" },
  { value: "course", label: "Courses" },
  { value: "audio", label: "Audio" },
];

const TYPE_ICON = { video: Film, course: BookOpen, audio: AudioLines };

/**
 * Jobs: every piece of work across all three pipelines, in one table.
 *
 * The important shift from v1 is that row actions are driven by the
 * `capabilities` the backend already returns per job (canCancel / canRetry /
 * canDelete - see jobAggregatorService) rather than re-derived from status
 * strings in the client. v1 guessed, which is how you end up offering Retry
 * on a job the API will refuse.
 */
export default function Jobs() {
  const navigate = useNavigate();
  const [page, setPage] = useState(1);
  const [type, setType] = useState("");
  const [state, setState] = useState("all");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState(() => new Set());
  const [busy, setBusy] = useState(null);

  const filters = useMemo(
    () => ({ type: type || undefined, search: search || undefined }),
    [type, search]
  );

  const { data, loading, refreshing, refetch } = useApiQuery(
    queryKeys.jobs.list(page, filters),
    () => getJobs(page, PAGE_SIZE, filters),
    {
      errorMessage: "Could not load jobs",
      refetchInterval: (query) =>
        (query.state.data?.jobs ?? []).some((j) => isRunning(j.status)) ? ACTIVE_POLL_MS : false,
      refetchIntervalInBackground: false,
    }
  );

  const invalidate = useInvalidate();
  const refresh = () => invalidate(queryKeys.jobs.all, queryKeys.videos.all, queryKeys.courses.all);

  const jobs = data?.jobs ?? EMPTY;
  const pagination = data?.pagination ?? { page, total: 0, pages: 0 };

  const counts = useMemo(() => {
    const tally = { all: jobs.length, run: 0, wait: 0, done: 0, fail: 0 };
    jobs.forEach((j) => { tally[stateOf(j.status)] = (tally[stateOf(j.status)] || 0) + 1; });
    return tally;
  }, [jobs]);

  const visible = useMemo(
    () => (state === "all" ? jobs : jobs.filter((j) => stateOf(j.status) === state)),
    [jobs, state]
  );

  const keyOf = (job) => `${job.type}:${job.id}`;
  const selectedJobs = visible.filter((j) => selected.has(keyOf(j)));
  const allSelected = visible.length > 0 && selectedJobs.length === visible.length;

  const toggle = (job) =>
    setSelected((prev) => {
      const next = new Set(prev);
      const key = keyOf(job);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const toggleAll = () =>
    setSelected(allSelected ? new Set() : new Set(visible.map(keyOf)));

  /** One action runner for both row and bulk paths, so they can't drift. */
  const run = async (label, fn, key) => {
    setBusy(key);
    try {
      await fn();
      toast.success(label);
      refresh();
    } catch (err) {
      toast.error(err.friendlyMessage || `${label} failed`);
    } finally {
      setBusy(null);
    }
  };

  const onCancel = async (job) => {
    if (!(await confirmDialog({
      title: "Stop this job?",
      content: `"${job.title}" will be marked cancelled.`,
      confirmText: "Stop", danger: true,
    }))) return;
    run(`Stopped "${job.title}"`, () => cancelJob(job.type, job.id), keyOf(job));
  };

  const onRetry = (job) =>
    run(`Retrying "${job.title}"`, () => retryJob(job.type, job.id), keyOf(job));

  const onDelete = async (job) => {
    if (!(await confirmDialog({
      title: `Delete "${job.title}"?`,
      content: "This can't be undone.",
      confirmText: "Delete", danger: true,
    }))) return;
    run(`Deleted "${job.title}"`, () => bulkJobAction([{ type: job.type, id: job.id }], "delete"), keyOf(job));
  };

  const onBulk = async (action) => {
    const items = selectedJobs.map((j) => ({ type: j.type, id: j.id }));
    if (items.length === 0) return;
    const label = { cancel: "Stop", retry: "Retry", delete: "Delete" }[action];

    if (!(await confirmDialog({
      title: `${label} ${items.length} job${items.length === 1 ? "" : "s"}?`,
      content:
        action === "delete"
          ? "This can't be undone. Jobs that don't support it are skipped."
          : "Jobs that don't support this action are skipped.",
      confirmText: label,
      danger: action !== "retry",
    }))) return;

    setBusy("bulk");
    try {
      const res = await bulkJobAction(items, action);
      const { succeeded = [], failed = [] } = res.data;
      if (failed.length === 0) toast.success(`${label}ed ${succeeded.length}/${items.length}`);
      else toast.error(`${label}ed ${succeeded.length}/${items.length} — ${failed.length} skipped`);
      setSelected(new Set());
      refresh();
    } catch (err) {
      toast.error(err.friendlyMessage || `Could not ${action} jobs`);
    } finally {
      setBusy(null);
    }
  };

  const columns = [
    {
      key: "select",
      width: 40,
      title: <Checkbox checked={allSelected} indeterminate={selectedJobs.length > 0 && !allSelected} onChange={toggleAll} srLabel="Select all jobs" />,
      render: (job) => (
        <span onClick={(e) => e.stopPropagation()}>
          <Checkbox checked={selected.has(keyOf(job))} onChange={() => toggle(job)} srLabel={`Select ${job.title}`} />
        </span>
      ),
    },
    {
      key: "title",
      title: "Job",
      render: (job) => {
        const Icon = TYPE_ICON[job.type] || Film;
        return (
          <div className="flex min-w-0 items-center gap-2.5">
            <span className="flex size-7 shrink-0 items-center justify-center rounded-[var(--radius-v2-sm)] bg-[var(--v2-hover)] text-lo">
              <Icon className="size-3.5" />
            </span>
            <div className="min-w-0">
              <p className="truncate text-[13px] font-medium text-hi">{job.title || "Untitled"}</p>
              <Mono>{job.id}</Mono>
            </div>
          </div>
        );
      },
    },
    {
      key: "pipeline",
      title: "Pipeline",
      width: 130,
      // Only video jobs run the five-stage pipeline; courses and audio have
      // their own shapes, so showing a track for them would be a lie.
      render: (job) => {
        const stages = job.type === "video" ? stagesFromStatus(job.status) : null;
        // A dash means "no pipeline to show" - either this job type has none,
        // or the status doesn't say where it got to. See stagesFromStatus.
        return stages ? (
          <PipelineTrack stages={stages} size="sm" />
        ) : (
          <span className="text-[12px] text-lo" title="Pipeline position unknown">—</span>
        );
      },
    },
    { key: "status", title: "Status", width: 170, render: (job) => <StatusPill status={job.status} /> },
    {
      key: "progress",
      title: "Progress",
      width: 130,
      render: (job) =>
        stateOf(job.status) === STATE.DONE ? (
          <span className="text-[12px] text-lo">Done</span>
        ) : (
          <div className="flex items-center gap-2">
            <Progress value={job.progress ?? 0} className="flex-1" />
            <span className="numeric w-8 text-right text-[11.5px] text-lo">{job.progress ?? 0}%</span>
          </div>
        ),
    },
    {
      key: "updatedAt",
      title: "Updated",
      width: 110,
      render: (job) => <span className="text-[12px] text-lo">{timeAgo(job.updatedAt || job.createdAt)}</span>,
    },
    {
      key: "actions",
      title: "",
      width: 44,
      align: "right",
      render: (job) => {
        const can = job.capabilities || {};
        return (
          <Menu
            trigger={
              <Button variant="ghost" size="sm" iconOnly loading={busy === keyOf(job)} icon={<MoreVertical className="size-4" />} aria-label={`Actions for ${job.title}`} />
            }
            items={[
              { label: "Stop", icon: <Square className="size-3.5" />, disabled: !can.canCancel, onSelect: () => onCancel(job) },
              { label: "Retry", icon: <Redo2 className="size-3.5" />, disabled: !can.canRetry, onSelect: () => onRetry(job) },
              { divider: true },
              { label: "Delete", icon: <Trash2 className="size-3.5" />, danger: true, disabled: !can.canDelete, onSelect: () => onDelete(job) },
            ]}
          />
        );
      },
    },
  ];

  return (
    <div className="mx-auto flex max-w-[1400px] animate-v2-rise flex-col gap-4">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <SearchInput
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          onClear={() => { setSearch(""); setPage(1); }}
          className="w-64"
        />
        <Select value={type} onChange={(v) => { setType(v); setPage(1); }} options={TYPE_OPTIONS} className="w-36" />
        <Segmented
          value={state}
          onChange={setState}
          options={[
            { value: "all", label: "All", count: counts.all },
            { value: STATE.RUN, label: "Running", count: counts.run },
            { value: STATE.WAIT, label: "Waiting", count: counts.wait },
            { value: STATE.DONE, label: "Done", count: counts.done },
            { value: STATE.FAIL, label: "Failed", count: counts.fail },
          ]}
        />
        <div className="flex-1" />
        <Button variant="outline" size="sm" loading={loading || refreshing} icon={<RefreshCw className="size-3.5" />} onClick={() => refetch()}>
          Refresh
        </Button>
      </div>

      {/* Bulk bar. Appears in flow rather than as a floating overlay, so it
          never covers the rows it acts on. */}
      {selectedJobs.length > 0 && (
        <div className="flex animate-v2-pop items-center gap-2 rounded-[var(--radius-v2-md)] border border-[var(--v2-accent)] bg-accent-soft px-4 py-2.5">
          <span className="text-[13px] font-medium text-hi">
            {selectedJobs.length} selected
          </span>
          <div className="flex-1" />
          <Button variant="ghost" size="sm" loading={busy === "bulk"} icon={<Square className="size-3.5" />} onClick={() => onBulk("cancel")}>Stop</Button>
          <Button variant="ghost" size="sm" loading={busy === "bulk"} icon={<Redo2 className="size-3.5" />} onClick={() => onBulk("retry")}>Retry</Button>
          <Button variant="ghost" size="sm" loading={busy === "bulk"} icon={<Trash2 className="size-3.5" />} onClick={() => onBulk("delete")} className="text-[var(--color-state-fail)]">Delete</Button>
          <Button variant="ghost" size="sm" onClick={() => setSelected(new Set())}>Clear</Button>
        </div>
      )}

      <Panel className="overflow-hidden">
        {loading ? (
          <div className="flex flex-col gap-3 p-5">
            {[0, 1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-12 w-full" />)}
          </div>
        ) : (
          <Table
            columns={columns}
            rows={visible}
            rowKey="id"
            onRowClick={(job) => job.type === "video" && navigate(`/v2/jobs/${job.id}`)}
            empty={
              <Empty
                icon={<ListChecks className="size-5" />}
                title={search || type || state !== "all" ? "No jobs match these filters" : "No jobs yet"}
                hint={search || type || state !== "all" ? "Try widening the filters above." : "Generated videos, courses and audio all appear here."}
              />
            }
          />
        )}
      </Panel>

      {/* Pagination */}
      {pagination.pages > 1 && (
        <div className="flex items-center justify-between">
          <span className="numeric text-[12.5px] text-lo">
            Page {pagination.page} of {pagination.pages} · {pagination.total} total
          </span>
          <div className="flex items-center gap-1.5">
            <Button variant="outline" size="sm" iconOnly disabled={pagination.page <= 1}
              onClick={() => { setPage(pagination.page - 1); setSelected(new Set()); }}
              icon={<ChevronLeft className="size-4" />} aria-label="Previous page" />
            <Button variant="outline" size="sm" iconOnly disabled={pagination.page >= pagination.pages}
              onClick={() => { setPage(pagination.page + 1); setSelected(new Set()); }}
              icon={<ChevronRight className="size-4" />} aria-label="Next page" />
          </div>
        </div>
      )}
    </div>
  );
}
