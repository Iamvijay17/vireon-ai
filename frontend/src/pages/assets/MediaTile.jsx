import { useState } from "react";
import { AlertTriangle, AudioLines, File as FileIcon, Film } from "lucide-react";
import { Badge } from "../../components/ui/Badge";
import { cn } from "../../components/ui/cn";
import { mediaKind } from "../../components/media/mediaKind";
import { resolveMediaUrl } from "../../services/api";
import { formatBytes } from "../../lib/format";
import { timeAgo } from "../../lib/timeAgo";
import { OWNER_LABEL } from "./mediaLibrary";

const PLACEHOLDER_ICON = { video: Film, audio: AudioLines, other: FileIcon };

/**
 * One file in the grid. Only images load anything here (lazily, as they
 * scroll into view); video and audio show an icon until the file is opened,
 * so a page of 24 renders never starts 24 downloads.
 */
export function MediaTile({ asset, onOpen }) {
  const [imageFailed, setImageFailed] = useState(false);
  const kind = mediaKind(asset);
  const Icon = PLACEHOLDER_ICON[kind] || FileIcon;

  return (
    <button
      type="button"
      onClick={() => onOpen(asset)}
      className="hover-lift group flex cursor-pointer flex-col overflow-hidden rounded-xl border border-border bg-surface text-left outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]"
    >
      <div className="relative aspect-video w-full overflow-hidden bg-neutral-950">
        {kind === "image" && !imageFailed ? (
          <img
            src={resolveMediaUrl(asset.url)}
            alt=""
            loading="lazy"
            decoding="async"
            onError={() => setImageFailed(true)}
            className="size-full object-cover"
          />
        ) : (
          <div className="flex size-full items-center justify-center text-neutral-600">
            <Icon className="size-7" />
          </div>
        )}
        {asset.orphaned && (
          <Badge variant="warning" className="absolute left-2 top-2 bg-black/60 backdrop-blur-sm" icon={<AlertTriangle className="size-3" />}>
            Orphaned
          </Badge>
        )}
      </div>
      <div className="flex flex-1 flex-col gap-1 p-3">
        <span className={cn("truncate text-[13px] font-medium text-text-primary")} title={asset.fileName}>
          {asset.fileName}
        </span>
        <span className="truncate text-xs text-text-tertiary">
          {OWNER_LABEL[asset.ownerType] || asset.ownerType} · {formatBytes(asset.size)}
        </span>
        <span className="text-[11px] text-text-tertiary" title={asset.createdAt ? new Date(asset.createdAt).toLocaleString() : undefined}>
          {timeAgo(asset.createdAt)}
        </span>
      </div>
    </button>
  );
}
