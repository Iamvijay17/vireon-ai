import { ExternalLink, AlertTriangle } from "lucide-react";
import { Badge } from "../../components/ui/Badge";
import { Progress } from "../../components/ui/Progress";
import { statusMeta, formatBytes } from "./format";
import { cn } from "../../components/ui/cn";

export const StatusBadge = ({ status }) => {
  const { label, variant } = statusMeta(status);
  return (
    <Badge variant={variant} dot>
      {label}
    </Badge>
  );
};

const barStatus = (status) => {
  if (status === "FAILED") return "error";
  if (status === "COMPLETED") return "success";
  return "active";
};

/** Percent bar + "12 MB of 340 MB" while there is something to show. */
export const JobProgress = ({ job }) => {
  const p = job.progress || {};
  const showBytes = job.platform === "youtube" && p.bytesTotal > 0 && ["UPLOADING", "PROCESSING", "RETRYING", "FAILED"].includes(job.status);
  if (job.status === "DRAFT" || job.status === "CANCELLED") return <span className="text-xs text-text-tertiary">—</span>;
  return (
    <div className="min-w-36">
      <Progress percent={p.percent || 0} status={barStatus(job.status)} size="sm" />
      <p className="mt-1 truncate text-[11px] text-text-tertiary">
        {showBytes ? `${formatBytes(p.bytesUploaded)} of ${formatBytes(p.bytesTotal)}` : p.phase || ""}
      </p>
    </div>
  );
};

export const RemoteLink = ({ url, children, className }) =>
  url ? (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      onClick={(e) => e.stopPropagation()}
      className={cn("inline-flex items-center gap-1 text-[13px] font-medium text-accent hover:underline", className)}
    >
      {children}
      <ExternalLink className="size-3" />
    </a>
  ) : null;

/** A failure with what to do about it - never just a code. */
export const ErrorNotice = ({ error, className }) => {
  if (!error?.code) return null;
  return (
    <div className={cn("flex items-start gap-2.5 rounded-xl border border-danger-500/20 bg-danger-500/8 p-3", className)}>
      <AlertTriangle className="mt-0.5 size-4 shrink-0 text-danger-500" />
      <div className="min-w-0 text-[13px]">
        <p className="font-medium text-text-primary">{error.message}</p>
        {error.action && <p className="mt-1 text-text-secondary">{error.action}</p>}
        <p className="mt-1 text-[11px] text-text-tertiary">
          Code {error.code}
          {error.httpStatus ? ` · HTTP ${error.httpStatus}` : ""}
          {error.retryable ? " · can be retried" : ""}
        </p>
      </div>
    </div>
  );
};
