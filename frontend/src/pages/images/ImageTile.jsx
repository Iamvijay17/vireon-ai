import { Download, Trash2, RefreshCw, Maximize2, TriangleAlert } from "lucide-react";
import { Button } from "../../components/ui/Button";
import { Badge } from "../../components/ui/Badge";
import { RelativeTime } from "../../components/ui/RelativeTime";
import { resolveMediaUrl } from "../../services/api";
import { GenerationProgress } from "./GenerationProgress";
import { STYLE_LABEL } from "./constants";

const ratioStyle = (item) => ({ aspectRatio: `${item.width || 16} / ${item.height || 9}` });

const formatDuration = (ms) => {
  const s = Math.round(ms / 1000);
  return s >= 60 ? `${Math.floor(s / 60)}m ${s % 60}s` : `${s}s`;
};

// One generation in the gallery. The picture - or its pending / failed
// placeholder, at the same aspect ratio so the layout doesn't jump when the
// image lands - fills the top; a slim footer carries the prompt and actions.
// Rendered inside a CSS-columns masonry, hence the break-inside-avoid.
export const ImageTile = ({ item, progress, deleting, onOpen, onDelete, onDownload, onReuse, onVariation }) => {
  const done = item.status === "COMPLETED" && item.imageUrl;

  return (
    <div className="mb-4 break-inside-avoid overflow-hidden rounded-xl border border-border-light bg-surface shadow-xs">
      {done ? (
        <button
          type="button"
          onClick={() => onOpen(item)}
          className="group relative block w-full cursor-zoom-in bg-surface-hover"
          style={ratioStyle(item)}
          aria-label="Open image"
        >
          <img src={resolveMediaUrl(item.imageUrl)} alt={item.prompt} loading="lazy" className="size-full object-cover" />
          <span className="absolute right-2 top-2 rounded-md bg-black/55 p-1.5 text-white opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
            <Maximize2 className="size-3.5" />
          </span>
        </button>
      ) : item.status === "FAILED" ? (
        // Capped height: a 9:16 error box would be a tall slab of red for one sentence.
        <div
          className="flex max-h-56 min-h-32 w-full flex-col items-center justify-center gap-2 bg-danger-500/5 p-4 text-center"
          style={ratioStyle(item)}
        >
          <TriangleAlert className="size-5 text-danger-500" />
          <p className="line-clamp-4 text-xs text-danger-600">{item.error || "Generation failed"}</p>
        </div>
      ) : (
        <GenerationProgress progress={progress} since={item.createdAt} className="min-h-40 w-full" />
      )}

      <div className="p-3">
        <p className="line-clamp-2 text-[13px] leading-snug text-text-secondary" title={item.prompt}>
          {item.prompt}
        </p>

        <div className="mt-2.5 flex items-center justify-between gap-2">
          <div className="flex min-w-0 flex-wrap items-center gap-1.5">
            <Badge variant="neutral">{item.aspectRatio}</Badge>
            {item.quality === "fast" && <Badge variant="warning">Fast</Badge>}
            {item.quality === "high" && <Badge variant="info">High</Badge>}
            {item.text && <Badge variant="neutral" title={`Text: ${item.text.split("\n").join(" | ")}`}>Text</Badge>}
            {item.negative && <Badge variant="neutral" title={`Avoid: ${item.negative}`}>Avoid</Badge>}
            {item.style && item.style !== "none" && <Badge variant="accent">{STYLE_LABEL[item.style] || item.style}</Badge>}
            {done && item.fromCache && <Badge variant="info">Cached</Badge>}
            {done && !item.fromCache && item.durationMs ? <Badge variant="neutral">{formatDuration(item.durationMs)}</Badge> : null}
          </div>

          <div className="-mr-1 flex shrink-0 items-center">
            <Button
              variant="ghost"
              size="xs"
              iconOnly
              aria-label="Generate another variation"
              title="Another variation (same prompt, new seed)"
              icon={<RefreshCw className="size-3.5" />}
              onClick={() => onVariation(item)}
            />
            {done && (
              <Button
                variant="ghost"
                size="xs"
                iconOnly
                aria-label="Download"
                title="Download"
                icon={<Download className="size-3.5" />}
                onClick={() => onDownload(item)}
              />
            )}
            <Button
              variant="ghost"
              size="xs"
              iconOnly
              aria-label="Delete"
              title="Delete"
              loading={deleting}
              disabled={item.status === "PENDING"}
              icon={<Trash2 className="size-3.5" />}
              onClick={() => onDelete(item)}
            />
          </div>
        </div>

        <div className="mt-1.5 flex items-center justify-between gap-2 text-[11px] text-text-tertiary">
          <RelativeTime value={item.createdAt} />
          <button type="button" onClick={() => onReuse(item)} className="cursor-pointer font-medium text-accent hover:underline">
            Use prompt
          </button>
        </div>
      </div>
    </div>
  );
};

export default ImageTile;
