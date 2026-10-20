import { useNavigate } from "react-router-dom";
import { AlertTriangle, ExternalLink, Link2, Trash2 } from "lucide-react";
import { Modal } from "../../components/ui/Modal";
import { Button } from "../../components/ui/Button";
import { Badge } from "../../components/ui/Badge";
import { CopyButton } from "../../components/ui/CopyButton";
import { DescriptionList } from "../../components/ui/DescriptionList";
import MediaPreview from "../../components/media/MediaPreview";
import { mediaKind, KIND_LABEL } from "../../components/media/mediaKind";
import { resolveMediaUrl } from "../../services/api";
import { formatBytes } from "../../lib/format";
import { OWNER_LABEL, CATEGORY_LABEL, ownerRoute } from "./mediaLibrary";

/**
 * One file in detail: a real preview (only now is a video or audio file
 * fetched), what it is, who made it, and the actions that exist - open it, copy
 * its link, go to the thing that produced it, delete it.
 */
export function MediaDetailModal({ asset, onClose, onDelete, deleting }) {
  const navigate = useNavigate();
  const route = ownerRoute(asset);
  const kind = mediaKind(asset);
  const url = resolveMediaUrl(asset.url);

  return (
    <Modal
      open
      onClose={onClose}
      title={<span className="break-all">{asset.fileName}</span>}
      width="xl"
      footer={
        <>
          <Button variant="danger" size="sm" icon={<Trash2 className="size-3.5" />} loading={deleting} onClick={() => onDelete(asset)} className="mr-auto">
            Delete file
          </Button>
          {route && (
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                onClose();
                navigate(route);
              }}
            >
              Go to {OWNER_LABEL[asset.ownerType]?.toLowerCase() || "source"}
            </Button>
          )}
          <Button variant="secondary" size="sm" icon={<ExternalLink className="size-3.5" />} onClick={() => window.open(url, "_blank", "noopener")}>
            Open file
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <MediaPreview item={asset} />

        {asset.orphaned && (
          <p className="flex items-start gap-2 rounded-lg border border-warning-500/25 bg-warning-500/8 p-3 text-xs leading-relaxed text-warning-600 dark:text-warning-500">
            <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
            Whatever produced this file no longer exists, so nothing uses it. Deleting it only reclaims storage.
          </p>
        )}

        <DescriptionList
          columns={3}
          items={[
            { label: "Type", value: asset.mimeType || KIND_LABEL[kind] },
            { label: "Size", value: formatBytes(asset.size) },
            { label: "Category", value: CATEGORY_LABEL[asset.category] || asset.category },
            { label: "Source", value: OWNER_LABEL[asset.ownerType] || asset.ownerType },
            { label: "Created", value: asset.createdAt ? new Date(asset.createdAt).toLocaleString() : "—" },
            { label: "Source ID", value: <span className="font-mono text-xs">{asset.ownerId}</span> },
          ]}
        />

        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-border-light pt-3">
          <span className="inline-flex items-center gap-1.5 text-xs text-text-tertiary">
            <Link2 className="size-3.5" /> Link
          </span>
          <CopyButton value={url} label="Copy link" />
          {asset.contentHash && (
            <span className="inline-flex items-center gap-1.5 text-xs text-text-tertiary">
              Content hash <span className="font-mono">{asset.contentHash.slice(0, 12)}</span>
              <CopyButton value={asset.contentHash} label="Copy content hash" size="xs" />
            </span>
          )}
          {asset.cacheKey && (
            <Badge variant="info" className="font-mono text-[10px]" title={asset.cacheKey}>
              cache {asset.cacheKey.slice(0, 8)}
            </Badge>
          )}
        </div>
      </div>
    </Modal>
  );
}
