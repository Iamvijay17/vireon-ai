import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { CheckCircle2, ShieldAlert, ShieldCheck, ShieldQuestion, TriangleAlert } from "lucide-react";
import { getVideoJobs } from "../../services/api";
import { PageHeader, EmptyState } from "../../components";
import DataTable from "../../components/DataTable";
import FilterBar from "../../components/FilterBar";
import StatusBadge from "../../components/StatusBadge";
import { StatTile } from "../../components/ui/StatTile";
import { SearchInput } from "../../components/ui/SearchInput";
import { SegmentedControl } from "../../components/ui/SegmentedControl";
import { Alert } from "../../components/ui/Alert";
import { queryKeys } from "../../lib/queryClient";
import { timeAgo } from "../../lib/timeAgo";
import { buildQualityRows, countVerdicts, filterRows, checkCoverage, VERDICTS } from "../../lib/qualityModel";
import { QualityDetailModal } from "./QualityDetailModal";
import { CheckCatalog } from "./CheckCatalog";

const FEED = 100;

const columns = [
  {
    key: "title",
    title: "Video",
    render: (r) => (
      <div className="min-w-0">
        <Link to={`/render?id=${r.id}`} onClick={(e) => e.stopPropagation()} className="block max-w-xs truncate text-[13px] font-medium text-text-primary hover:text-accent-fg" title={r.title}>
          {r.title}
        </Link>
        <span className="text-[11px] text-text-tertiary">Job {r.jobStatus.toLowerCase().replace(/_/g, " ")}</span>
      </div>
    ),
  },
  { key: "verdict", title: "Quality", width: 150, render: (r) => <StatusBadge kind="quality" status={r.verdict} /> },
  {
    key: "issues",
    title: "Findings",
    width: 170,
    render: (r) =>
      r.report ? (
        <span className="tabular text-xs">
          <span className={r.errors ? "font-medium text-danger-500" : "text-text-tertiary"}>{r.errors} error{r.errors === 1 ? "" : "s"}</span>
          <span className="text-text-tertiary"> · </span>
          <span className={r.warnings ? "font-medium text-warning-600 dark:text-warning-500" : "text-text-tertiary"}>{r.warnings} warning{r.warnings === 1 ? "" : "s"}</span>
        </span>
      ) : (
        <span className="text-xs text-text-tertiary">—</span>
      ),
  },
  { key: "mode", title: "Mode", width: 90, render: (r) => <span className="text-xs text-text-tertiary">{r.mode || "—"}</span> },
  {
    key: "checkedAt",
    title: "Checked",
    width: 110,
    align: "right",
    render: (r) => <span className="text-xs text-text-tertiary" title={r.checkedAt ? new Date(r.checkedAt).toLocaleString() : undefined}>{r.checkedAt ? timeAgo(r.checkedAt) : "never"}</span>,
  },
];

/**
 * Quality Control: the result of the output checks that run after every render.
 * A video is shown as passed only when its stored report says so; a finished
 * video with no report is "Not checked" (rendered before the checks existed, or
 * checks switched off) - never given the benefit of the doubt. The checks run
 * on the server as part of the pipeline; this page reads their reports.
 */
const QualityPage = () => {
  const [verdict, setVerdict] = useState("all");
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(null);

  const query = useQuery({
    queryKey: queryKeys.videos.recent(FEED),
    queryFn: async () => (await getVideoJobs(1, FEED)).data,
  });

  const rows = useMemo(() => buildQualityRows(query.data?.jobs), [query.data]);
  const counts = useMemo(() => countVerdicts(rows), [rows]);
  const coverage = useMemo(() => checkCoverage(rows), [rows]);
  const visible = useMemo(() => filterRows(rows, { verdict, search }), [rows, verdict, search]);

  // A failed load is not "0 of everything": figures are unknown, not zero.
  const unknown = query.isLoading || Boolean(query.error);
  const total = query.data?.pagination?.total ?? 0;
  const loaded = query.data?.jobs?.length ?? 0;
  const modes = [...new Set(rows.map((r) => r.mode).filter(Boolean))];

  return (
    <div>
      <PageHeader
        title="Quality Control"
        description="Every render is checked for a readable file, audible narration, correct length, black frames, timed captions and loadable images before it counts as complete."
      />

      {counts.unchecked > 0 && (
        <Alert type="warning" className="mb-4" title={`${counts.unchecked} finished video${counts.unchecked === 1 ? " has" : "s have"} not been checked`}>
          They were rendered before quality checks existed, or while checks were switched off. They are not counted as passed. Re-rendering a video runs the checks on it.
        </Alert>
      )}
      {modes.includes("report") && (
        <Alert type="info" className="mb-4" title="Some videos were checked in report-only mode">
          In report mode a failed check is recorded but does not stop the video from completing. Only enforce mode blocks a bad render.
        </Alert>
      )}

      <section aria-label="Quality summary" className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
        <StatTile label="Passed" icon={CheckCircle2} tone="success" loading={query.isLoading} value={unknown ? null : counts.passed} onClick={() => setVerdict("passed")} />
        <StatTile label="With warnings" icon={TriangleAlert} tone="warning" loading={query.isLoading} value={unknown ? null : counts["passed-with-warnings"]} onClick={() => setVerdict("passed-with-warnings")} />
        <StatTile label="Failed" icon={ShieldAlert} tone={counts.failed ? "danger" : "neutral"} loading={query.isLoading} value={unknown ? null : counts.failed} onClick={() => setVerdict("failed")} />
        <StatTile label="Skipped" icon={ShieldCheck} loading={query.isLoading} value={unknown ? null : counts.skipped} hint="Checker unavailable" onClick={() => setVerdict("skipped")} />
        <StatTile label="Not checked" icon={ShieldQuestion} tone={counts.unchecked ? "warning" : "neutral"} loading={query.isLoading} value={unknown ? null : counts.unchecked} hint="No report on file" onClick={() => setVerdict("unchecked")} />
      </section>

      <FilterBar
        search={<SearchInput value={search} onChange={setSearch} placeholder="Search videos" />}
        onRefresh={() => query.refetch()}
        refreshing={query.isFetching && !query.isLoading}
        refreshLabel="Refresh reports"
      >
        <SegmentedControl
          aria-label="Filter by quality verdict"
          value={verdict}
          onChange={setVerdict}
          options={VERDICTS.map((v) => ({ ...v, count: unknown ? undefined : counts[v.value] }))}
        />
      </FilterBar>

      <DataTable
        columns={columns}
        data={visible}
        rowKey="id"
        loading={query.isLoading}
        error={query.error}
        onRetry={() => query.refetch()}
        onRowClick={setOpen}
        empty={
          rows.length === 0 ? (
            <EmptyState compact icon={ShieldCheck} title="No finished videos yet" description="Once a video has been rendered, its quality report appears here." />
          ) : (
            <EmptyState compact icon={ShieldCheck} title="No videos match" description="Try a different verdict or search." actionLabel="Show all" onAction={() => { setVerdict("all"); setSearch(""); }} />
          )
        }
      />
      {total > loaded && (
        <p className="mt-2 text-xs text-text-tertiary">
          Showing the latest {loaded} of {total} videos. Older ones are in <Link to="/projects" className="underline hover:text-text-primary">My Projects</Link>.
        </p>
      )}

      <CheckCatalog coverage={coverage} videos={rows.filter((r) => r.report).length} />

      {open && <QualityDetailModal row={open} onClose={() => setOpen(null)} />}
    </div>
  );
};

export default QualityPage;
