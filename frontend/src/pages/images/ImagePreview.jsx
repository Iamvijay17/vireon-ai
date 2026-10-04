import { Download, RotateCcw } from "lucide-react";
import { Modal } from "../../components/ui/Modal";
import { Button } from "../../components/ui/Button";
import { CopyButton } from "../../components/ui/CopyButton";
import { resolveMediaUrl } from "../../services/api";
import { STYLE_LABEL } from "./constants";

const Detail = ({ label, children }) => (
  <div className="min-w-0">
    <dt className="text-[11px] font-medium uppercase tracking-wide text-text-tertiary">{label}</dt>
    <dd className="mt-0.5 flex items-center gap-1 truncate text-[13px] text-text-primary">{children}</dd>
  </div>
);

const QUALITY_LABEL = { fast: "Fast", standard: "Standard", high: "High" };

const formatDuration = (ms) => {
  const s = Math.round(ms / 1000);
  return s >= 60 ? `${Math.floor(s / 60)}m ${s % 60}s` : `${s}s`;
};

// Full-size view of one image with everything needed to reproduce or refine it.
export const ImagePreview = ({ item, onClose, onDownload, onReuseSettings }) => (
  <Modal
    open={Boolean(item)}
    onClose={onClose}
    title="Image"
    width="xl"
    footer={
      item && (
        <>
          <Button variant="ghost" size="sm" icon={<RotateCcw className="size-3.5" />} onClick={() => onReuseSettings(item)} title="Load the prompt, options and seed back into the prompt bar">
            Reuse settings
          </Button>
          <Button variant="secondary" size="sm" icon={<Download className="size-3.5" />} onClick={() => onDownload(item)}>
            Download
          </Button>
        </>
      )
    }
  >
    {item && (
      <>
        <img src={resolveMediaUrl(item.imageUrl)} alt={item.prompt} className="w-full rounded-lg" />

        <div className="mt-3 flex items-start gap-1">
          <p className="min-w-0 flex-1 text-[13px] text-text-secondary">{item.prompt}</p>
          <CopyButton value={item.prompt} label="Copy prompt" />
        </div>

        <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 border-t border-border-light pt-4 sm:grid-cols-3">
          <Detail label="Shape">{item.aspectRatio}</Detail>
          <Detail label="Quality">{QUALITY_LABEL[item.quality] || "Standard"}</Detail>
          <Detail label="Style">{STYLE_LABEL[item.style] || "No style"}</Detail>
          <Detail label="Seed">
            {item.seed != null ? (
              <>
                <span className="truncate tabular-nums">{item.seed}</span>
                <CopyButton value={String(item.seed)} label="Copy seed" />
              </>
            ) : (
              "-"
            )}
          </Detail>
          <Detail label="Took">{item.fromCache ? "Cached" : item.durationMs ? formatDuration(item.durationMs) : "-"}</Detail>
          <Detail label="Created">{item.createdAt ? new Date(item.createdAt).toLocaleString() : "-"}</Detail>
        </dl>
      </>
    )}
  </Modal>
);

export default ImagePreview;
