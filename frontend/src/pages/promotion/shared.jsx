import { ExternalLink, Film, ImageIcon } from "lucide-react";
import { Badge } from "../../components/ui/Badge";
import { Progress } from "../../components/ui/Progress";
import { cn } from "../../components/ui/cn";
import { resolveStoragePath, resolveThumbnailUrl } from "../../services/api";
import { statusMeta, PLATFORM_META, platformLabel, formatBytes } from "./format";

export { ErrorNotice } from "../publishing/shared";

/** A letter tile for a platform - deliberately not a logo. */
export const PlatformTile = ({ platform, size = "md", className }) => {
  const meta = PLATFORM_META[platform] || { short: "?", color: "#6b7280" };
  return (
    <span
      aria-hidden="true"
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-lg font-bold",
        size === "sm" ? "size-6 text-[11px]" : size === "lg" ? "size-11 text-base" : "size-8 text-[13px]",
        className
      )}
      style={{ backgroundColor: meta.color, color: "#ffffff" }}
    >
      {meta.short}
    </span>
  );
};

export const PlatformBadge = ({ platform }) => (
  <span className="inline-flex items-center gap-1.5 text-[13px] font-medium text-text-primary">
    <PlatformTile platform={platform} size="sm" />
    {platformLabel(platform)}
  </span>
);

export const StatusBadge = ({ status }) => {
  const { label, variant } = statusMeta(status);
  return <Badge variant={variant} dot>{label}</Badge>;
};

const barStatus = (status) => (status === "FAILED" ? "error" : status === "COMPLETED" ? "success" : "active");

/** Percent bar + what the worker is doing, while there is something to show. */
export const PostProgress = ({ post }) => {
  const p = post.progress || {};
  if (["DRAFT", "SCHEDULED", "CANCELLED"].includes(post.status)) return <span className="text-xs text-text-tertiary">—</span>;
  const showBytes = p.bytesTotal > 0 && ["UPLOADING", "PROCESSING", "RETRYING"].includes(post.status) && p.percent < 100;
  return (
    <div className="min-w-32">
      <Progress percent={p.percent || 0} status={barStatus(post.status)} size="sm" />
      <p className="mt-1 truncate text-[11px] text-text-tertiary">
        {showBytes ? `${formatBytes(p.bytesUploaded)} of ${formatBytes(p.bytesTotal)}` : p.phase || ""}
      </p>
    </div>
  );
};

export const RemoteLink = ({ url, children, className }) =>
  url ? (
    <a
      href={url} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()}
      className={cn("inline-flex items-center gap-1 text-[13px] font-medium text-accent hover:underline", className)}
    >
      {children}
      <ExternalLink className="size-3" />
    </a>
  ) : null;

/** The picture to show for a campaign's media: its thumbnail, else the image itself, else a placeholder. */
export const MediaThumb = ({ media, thumbnail, thumbnailUrl, className, alt = "" }) => {
  const src = thumbnailUrl ? resolveThumbnailUrl(thumbnailUrl)
    : thumbnail?.previewPath ? resolveStoragePath(thumbnail.previewPath)
      : media?.kind === "image" && media.previewPath ? resolveStoragePath(media.previewPath) : "";
  if (src) return <img src={src} alt={alt} loading="lazy" className={cn("bg-surface-hover object-cover", className)} referrerPolicy="no-referrer" />;
  const Icon = media?.kind === "image" ? ImageIcon : Film;
  return (
    <div className={cn("flex items-center justify-center bg-surface-hover text-text-tertiary", className)}>
      <Icon className="size-6" />
    </div>
  );
};

/** Skeleton rows for lists while the first load is in flight. */
export const SkeletonRows = ({ rows = 3, className }) => (
  <div className={cn("space-y-3", className)} aria-busy="true" aria-label="Loading">
    {Array.from({ length: rows }).map((_, i) => (
      <div key={i} className="h-16 animate-pulse rounded-xl bg-surface-hover" />
    ))}
  </div>
);
