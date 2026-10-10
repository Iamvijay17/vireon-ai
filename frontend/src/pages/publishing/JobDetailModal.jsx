import { Modal } from "../../components/ui/Modal";
import { Timeline } from "../../components/ui/Timeline";
import { CopyButton } from "../../components/ui/CopyButton";
import { Button } from "../../components/ui/Button";
import { LoadingState, ErrorState } from "../../components";
import { Download } from "lucide-react";
import { getPublishingDownloadUrl } from "../../services/api";
import { PLATFORM_LABEL, formatBytes, mergeLive } from "./format";
import { usePublishingJob } from "./usePublishing";
import { StatusBadge, JobProgress, RemoteLink, ErrorNotice } from "./shared";

const Row = ({ label, children }) =>
  children ? (
    <div className="grid grid-cols-[8.5rem_1fr] items-start gap-3 py-2 text-[13px]">
      <dt className="text-text-tertiary">{label}</dt>
      <dd className="min-w-0 break-words text-text-primary">{children}</dd>
    </div>
  ) : null;

const Copyable = ({ value, label }) => (
  <span className="inline-flex max-w-full items-center gap-1">
    <span className="truncate font-mono text-xs">{value}</span>
    <CopyButton value={value} label={label} />
  </span>
);

const when = (v) => (v ? new Date(v).toLocaleString() : "");
const LEVEL_COLOR = { info: "neutral", warn: "warning", error: "error" };

/** Everything the system knows about one publish: ids, URLs, attempts, the error with its fix, and the full timeline. */
export const JobDetailModal = ({ jobId, live, accounts, onClose }) => {
  const { data, loading, error, refetch } = usePublishingJob(jobId);
  const job = data ? mergeLive(data, live) : null;
  const account = accounts.find((a) => a._id === job?.accountId);

  const events = (job?.events || []).slice().reverse().map((e) => ({
    title: e.message,
    timestamp: `${when(e.at)} · ${e.status}`,
    color: LEVEL_COLOR[e.level] || "neutral",
  }));

  return (
    <Modal open onClose={onClose} width="xl" title={job?.lessonTitle || "Publishing job"} description={job ? PLATFORM_LABEL[job.platform] : undefined}>
      {loading && <LoadingState label="Loading..." minHeight={140} />}
      {!loading && error && <ErrorState message="Could not load this job" onRetry={refetch} />}
      {job && (
        <div className="space-y-5">
          <div className="flex flex-wrap items-center gap-3">
            <StatusBadge status={job.status} />
            <div className="min-w-40 flex-1"><JobProgress job={job} /></div>
          </div>

          <ErrorNotice error={job.error} />

          <dl className="divide-y divide-border-light rounded-xl border border-border-light px-3">
            <Row label="Job ID"><Copyable value={job._id} label="Copy job ID" /></Row>
            {job.platform === "youtube" && (
              <>
                <Row label="Channel">{account ? `${account.displayName} (${account.externalId})` : job.accountId}</Row>
                <Row label="Title">{job.metadata?.title}</Row>
                <Row label="Visibility">
                  {job.metadata?.privacyStatus}
                  {job.metadata?.publishAt ? ` · goes public ${when(job.metadata.publishAt)}` : ""}
                </Row>
                <Row label="YouTube video ID">{job.remote?.videoId ? <Copyable value={job.remote.videoId} label="Copy video ID" /> : null}</Row>
                <Row label="Watch URL">{job.remote?.url ? <span className="inline-flex items-center gap-1"><RemoteLink url={job.remote.url}>{job.remote.url}</RemoteLink><CopyButton value={job.remote.url} label="Copy URL" /></span> : null}</Row>
                <Row label="YouTube Studio">{job.remote?.studioUrl ? <RemoteLink url={job.remote.studioUrl}>Open in Studio</RemoteLink> : null}</Row>
                <Row label="YouTube status">{job.remote?.uploadStatus ? `${job.remote.uploadStatus}${job.remote.processingState ? ` · ${job.remote.processingState}` : ""}` : null}</Row>
                <Row label="File">{job.source?.size ? formatBytes(job.source.size) : null}</Row>
              </>
            )}
            {job.platform === "udemy-export" && (
              <>
                <Row label="Package">{job.exportResult?.fileName ? `${job.exportResult.fileName} · ${formatBytes(job.exportResult.size)}` : null}</Row>
                <Row label="Options">
                  {[job.exportOptions?.includeMedia ? "with videos" : "manifest only", job.exportOptions?.includeCaptions ? "captions" : null, job.exportOptions?.allowIncomplete ? "incomplete allowed" : null].filter(Boolean).join(" · ")}
                </Row>
                <Row label="Lessons">{job.exportResult?.totals ? `${job.exportResult.totals.lecturesWithVideo}/${job.exportResult.totals.lectures} with video in ${job.exportResult.totals.sections} section(s)` : null}</Row>
              </>
            )}
            <Row label="Attempts">{job.attempts ? `${job.attempts} of ${job.maxAttempts}${job.deferrals ? ` · waited for quota ${job.deferrals}×` : ""}` : null}</Row>
            <Row label="Next attempt">{job.status === "RETRYING" ? when(job.nextRetryAt) : null}</Row>
            <Row label="Created">{when(job.createdAt)}</Row>
            <Row label="Approved">{when(job.approvedAt)}</Row>
            <Row label="Finished">{when(job.completedAt || job.cancelledAt)}</Row>
          </dl>

          {job.actions?.canDownload && (
            <Button variant="primary" icon={<Download className="size-4" />} href={getPublishingDownloadUrl(job._id)}>Download package</Button>
          )}

          <div>
            <h3 className="mb-3 text-[13px] font-semibold text-text-primary">History</h3>
            {events.length ? <Timeline items={events} /> : <p className="text-sm text-text-tertiary">No events yet.</p>}
          </div>
        </div>
      )}
    </Modal>
  );
};

export default JobDetailModal;
