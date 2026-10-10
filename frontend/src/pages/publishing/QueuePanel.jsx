import { useMemo, useState } from "react";
import { RotateCcw, Square, Download, Eye, Send, ChevronLeft, ChevronRight } from "lucide-react";
import { Card, CardHeader } from "../../components/ui/Card";
import { Table } from "../../components/ui/Table";
import { Button } from "../../components/ui/Button";
import { Select } from "../../components/ui/Select";
import { RelativeTime } from "../../components/ui/RelativeTime";
import { EmptyState, ErrorState } from "../../components";
import { confirmDialog } from "../../components/ui/confirmBus";
import { useInvalidate } from "../../lib/useApiQuery";
import { queryKeys } from "../../lib/queryClient";
import { retryPublishingJob, cancelPublishingJob, getPublishingDownloadUrl } from "../../services/api";
import { mergeLive, PLATFORM_LABEL, isFinishedStatus } from "./format";
import { usePublishingJobs, useLiveJobs, useBusy } from "./usePublishing";
import { StatusBadge, JobProgress, RemoteLink } from "./shared";
import { JobDetailModal } from "./JobDetailModal";

const VIEWS = [
  { value: "all", label: "Everything" },
  { value: "active", label: "In progress & drafts" },
  { value: "finished", label: "History (finished)" },
];
const PLATFORMS = [
  { value: "", label: "All destinations" },
  { value: "youtube", label: "YouTube" },
  { value: "udemy-export", label: "Udemy packages" },
];
const PAGE_SIZE = 20;

/** Queue + history in one place: live progress while running, the record of what happened afterwards. */
export const QueuePanel = ({ accounts, caps, onReview }) => {
  const invalidate = useInvalidate();
  const { isBusy, run } = useBusy();
  const [view, setView] = useState("all");
  const [platform, setPlatform] = useState("");
  const [page, setPage] = useState(1);
  const [detailId, setDetailId] = useState(null);

  const params = useMemo(() => ({
    page, limit: PAGE_SIZE,
    ...(platform && { platform }),
    ...(view !== "all" && { finished: view === "finished" ? "true" : "false" }),
  }), [page, platform, view]);

  const { data, loading, error, refetch } = usePublishingJobs(params);
  const live = useLiveJobs();
  const jobs = useMemo(() => (data?.jobs || []).map((j) => mergeLive(j, live[j._id])), [data, live]);
  const pagination = data?.pagination;
  const accountName = (id) => accounts.find((a) => a._id === id)?.displayName;

  const refresh = () => invalidate(queryKeys.publishing.all);

  const retry = (job) => run(`retry:${job._id}`, () => retryPublishingJob(job._id), { success: "Queued for another attempt" }).then((r) => r && refresh());
  const cancel = async (job) => {
    const ok = await confirmDialog({
      title: "Cancel this job?",
      content: job.remote?.videoId ? "The video is already on YouTube and will stay there. Vireon just stops tracking it." : "The upload stops. You can start again from a new draft.",
      danger: true, confirmText: "Cancel job", cancelText: "Keep running",
    });
    if (ok) run(`cancel:${job._id}`, () => cancelPublishingJob(job._id), { success: "Job cancelled" }).then((r) => r && refresh());
  };

  const columns = [
    {
      key: "target", title: "Job",
      render: (j) => (
        <div className="min-w-0">
          <p className="truncate font-medium text-text-primary">{j.lessonTitle || "Untitled"}</p>
          <p className="text-xs text-text-tertiary">
            {PLATFORM_LABEL[j.platform] || j.platform}
            {j.platform === "youtube" && accountName(j.accountId) ? ` → ${accountName(j.accountId)}` : ""}
          </p>
        </div>
      ),
    },
    {
      key: "status", title: "Status",
      render: (j) => (
        <div className="flex flex-col items-start gap-1">
          <StatusBadge status={j.status} />
          {j.status === "RETRYING" && j.nextRetryAt && <span className="text-[11px] text-text-tertiary">retry <RelativeTime value={j.nextRetryAt} /> ({j.attempts}/{j.maxAttempts})</span>}
          {j.status === "FAILED" && j.error?.message && <span className="max-w-56 truncate text-[11px] text-danger-500" title={j.error.message}>{j.error.message}</span>}
        </div>
      ),
    },
    { key: "progress", title: "Progress", render: (j) => <JobProgress job={j} /> },
    {
      key: "remote", title: "Result",
      render: (j) =>
        j.platform === "youtube"
          ? (j.remote?.url ? <div><RemoteLink url={j.remote.url}>Watch</RemoteLink><p className="font-mono text-[11px] text-text-tertiary">{j.remote.videoId}</p></div> : <span className="text-xs text-text-tertiary">—</span>)
          : (j.exportResult?.fileName ? <span className="text-xs text-text-secondary">{j.exportResult.fileName}</span> : <span className="text-xs text-text-tertiary">—</span>),
    },
    { key: "when", title: "Updated", render: (j) => <RelativeTime value={j.updatedAt} className="text-xs text-text-tertiary" /> },
    {
      key: "actions", title: "", align: "right",
      render: (j) => (
        <div className="flex flex-wrap items-center justify-end gap-1.5" onClick={(e) => e.stopPropagation()}>
          {j.status === "DRAFT" && j.platform === "youtube" && <Button size="xs" variant="primary" icon={<Send className="size-3.5" />} onClick={() => onReview(j)}>Review</Button>}
          {j.actions?.canRetry && <Button size="xs" variant="secondary" icon={<RotateCcw className="size-3.5" />} loading={isBusy(`retry:${j._id}`)} onClick={() => retry(j)}>Retry</Button>}
          {j.actions?.canCancel && <Button size="xs" variant="ghost" icon={<Square className="size-3.5" />} loading={isBusy(`cancel:${j._id}`)} onClick={() => cancel(j)}>Cancel</Button>}
          {j.actions?.canDownload && <Button size="xs" variant="secondary" icon={<Download className="size-3.5" />} href={getPublishingDownloadUrl(j._id)}>Download</Button>}
          <Button size="xs" variant="ghost" iconOnly aria-label="Details" icon={<Eye className="size-3.5" />} onClick={() => setDetailId(j._id)} />
        </div>
      ),
    },
  ];

  const filtered = view !== "all" || platform;

  return (
    <Card>
      <CardHeader
        title="Queue & history"
        subtitle="Live progress for running uploads, and a permanent record of everything published or exported."
        extra={
          <>
            <Select className="w-48" value={view} onChange={(v) => { setView(v); setPage(1); }} options={VIEWS} />
            <Select className="w-44" value={platform} onChange={(v) => { setPlatform(v); setPage(1); }} options={PLATFORMS} />
          </>
        }
      />
      <div className="p-2 sm:p-3">
        {error ? (
          <div className="p-3"><ErrorState message="Could not load publishing jobs" onRetry={refetch} /></div>
        ) : (
          <Table
            columns={columns} data={jobs} loading={loading} onRowClick={(j) => setDetailId(j._id)}
            emptyContent={
              <EmptyState
                description={filtered ? "Nothing matches these filters" : "Nothing has been published yet. Pick a lesson on the Publish tab to get started."}
              />
            }
          />
        )}
        {pagination && pagination.pages > 1 && (
          <div className="flex items-center justify-between px-3 pb-2 pt-3 text-xs text-text-tertiary">
            <span>Page {pagination.page} of {pagination.pages} · {pagination.total} jobs</span>
            <div className="flex gap-1.5">
              <Button size="xs" variant="secondary" iconOnly aria-label="Previous page" icon={<ChevronLeft className="size-3.5" />} disabled={page <= 1} onClick={() => setPage((p) => p - 1)} />
              <Button size="xs" variant="secondary" iconOnly aria-label="Next page" icon={<ChevronRight className="size-3.5" />} disabled={page >= pagination.pages} onClick={() => setPage((p) => p + 1)} />
            </div>
          </div>
        )}
        {!caps?.youtube?.configured && jobs.some((j) => j.platform === "youtube" && !isFinishedStatus(j.status)) && (
          <p className="px-3 pb-2 text-xs text-warning-600">YouTube is not configured on this server, so queued uploads will not run until it is.</p>
        )}
      </div>
      {detailId && <JobDetailModal jobId={detailId} live={live[detailId]} accounts={accounts} onClose={() => setDetailId(null)} />}
    </Card>
  );
};

export default QueuePanel;
