import { useState, useRef, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { ImagePlus, Wand2, Loader2, RefreshCw, Download, Trash2, Zap, Sparkles } from "lucide-react";
import {
  generateImage,
  getImageGenerations,
  getImageProgress,
  deleteImageGeneration,
  resolveMediaUrl,
} from "../../services/api";
import { queryKeys } from "../../lib/queryClient";
import { useApiQuery, useInvalidate } from "../../lib/useApiQuery";
import { Card } from "../../components/ui/Card";
import { Badge } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import { Modal } from "../../components/ui/Modal";
import { Spinner } from "../../components/ui/Spinner";
import { Textarea } from "../../components/ui/Input";
import { cn } from "../../components/ui/cn";
import { toast } from "../../components/ui/toastBus";
import { confirmDialog } from "../../components/ui/confirmBus";
import { ImageTile } from "./ImageTile";

const MAX_CHARS = 1000;

// 4:5 is accepted by the API but maps to the portrait size, so only the
// shapes that really produce a distinct picture are offered.
const ASPECTS = [
  { value: "16:9", label: "Landscape", box: "h-2.5 w-4" },
  { value: "9:16", label: "Portrait", box: "h-4 w-2.5" },
  { value: "1:1", label: "Square", box: "h-3 w-3" },
];

const QUALITIES = [
  { value: "fast", label: "Fast", icon: <Zap className="size-3.5" />, title: "Fewer steps: about 35s, a little less detail" },
  { value: "standard", label: "Standard", icon: <Sparkles className="size-3.5" />, title: "Full steps: about a minute, best detail" },
];

// While something renders: the list is re-checked every few seconds (a safety
// net - a finished render is noticed sooner, see the effect below), and the
// in-memory progress endpoint every second for the live percentage.
const LIST_POLL_MS = 3000;
const PROGRESS_POLL_MS = 1000;
const EMPTY = [];

// Compact pill-style single choice: one control, all options visible.
const Segmented = ({ options, value, onChange, label, className }) => (
  <div role="group" aria-label={label} className={cn("grid gap-1 rounded-lg bg-surface-hover p-1", className)} style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}>
    {options.map((o) => (
      <button
        key={o.value}
        type="button"
        title={o.title}
        aria-pressed={value === o.value}
        onClick={() => onChange(o.value)}
        className={cn(
          "flex h-7 cursor-pointer items-center justify-center gap-1.5 rounded-md px-2 text-xs font-medium transition-colors",
          value === o.value ? "bg-surface text-accent shadow-xs" : "text-text-secondary hover:text-text-primary"
        )}
      >
        {o.icon ?? <span className={cn("rounded-[2px] border-[1.5px] border-current", o.box)} />}
        {o.label}
      </button>
    ))}
  </div>
);

const ImagesPage = () => {
  const [prompt, setPrompt] = useState("");
  const [aspectRatio, setAspectRatio] = useState("16:9");
  const [quality, setQuality] = useState("standard");
  const [submitting, setSubmitting] = useState(false);
  const [deletingId, setDeletingId] = useState(null);
  const [clearing, setClearing] = useState(false);
  const [preview, setPreview] = useState(null);
  const promptRef = useRef(null);
  const invalidate = useInvalidate();

  const { data, loading: historyLoading, error: historyError, refetch } = useApiQuery(
    queryKeys.images.history(1),
    () => getImageGenerations(1, 60),
    {
      select: (res) => res.items || [],
      errorMessage: "Failed to load images",
      // The list endpoint also fails PENDING records that a server restart
      // orphaned, so this polling always ends.
      refetchInterval: (query) => (query.state.data?.some((h) => h.status === "PENDING") ? LIST_POLL_MS : false),
    }
  );
  const history = data ?? EMPTY;
  const rendering = history.filter((h) => h.status === "PENDING").length;
  const failed = history.filter((h) => h.status === "FAILED");

  // Plain useQuery, not useApiQuery: that toasts every failure, which at one
  // poll a second would bury the page if the API blipped. Progress is cosmetic.
  const { data: progress } = useQuery({
    queryKey: queryKeys.images.progress(),
    queryFn: async () => (await getImageProgress()).data.active || {},
    enabled: rendering > 0,
    refetchInterval: PROGRESS_POLL_MS,
    retry: false,
  });

  // A pending image that is no longer running on the server has finished (or
  // was orphaned): pull the list now instead of waiting for the next poll.
  useEffect(() => {
    if (progress && history.some((h) => h.status === "PENDING" && !(h._id in progress))) refetch();
  }, [progress, history, refetch]);

  const startGeneration = async (text, ratio, qual) => {
    try {
      setSubmitting(true);
      await generateImage({ prompt: text, aspectRatio: ratio, quality: qual });
      await invalidate(queryKeys.images.all);
    } catch (err) {
      toast.error(err.response?.data?.message || err.friendlyMessage || "Failed to start image generation");
    } finally {
      setSubmitting(false);
    }
  };

  const handleGenerate = () => {
    const text = prompt.trim();
    if (text.length < 3) {
      toast.error("Describe the image you want");
      return;
    }
    startGeneration(text, aspectRatio, quality);
  };

  const handleVariation = (item) => startGeneration(item.prompt, item.aspectRatio, item.quality || "standard");

  const handleReuse = (item) => {
    setPrompt(item.prompt);
    setAspectRatio(item.aspectRatio === "4:5" ? "9:16" : item.aspectRatio);
    setQuality(item.quality || "standard");
    promptRef.current?.focus();
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleDelete = async (item) => {
    const ok = await confirmDialog({
      title: "Delete this image?",
      content: "This removes the image file and its history entry. This can't be undone.",
      confirmText: "Delete",
      danger: true,
    });
    if (!ok) return;
    try {
      setDeletingId(item._id);
      await deleteImageGeneration(item._id);
      invalidate(queryKeys.images.all);
      setPreview((p) => (p?._id === item._id ? null : p));
    } catch (err) {
      toast.error(err.response?.data?.message || err.friendlyMessage || "Failed to delete image");
    } finally {
      setDeletingId(null);
    }
  };

  const handleClearFailed = async () => {
    const ok = await confirmDialog({
      title: `Remove ${failed.length} failed image${failed.length === 1 ? "" : "s"}?`,
      content: "These generations didn't produce a picture. Only their history entries are removed.",
      confirmText: "Remove",
      danger: true,
    });
    if (!ok) return;
    try {
      setClearing(true);
      const results = await Promise.allSettled(failed.map((f) => deleteImageGeneration(f._id)));
      const errors = results.filter((r) => r.status === "rejected").length;
      if (errors) toast.error(`${errors} couldn't be removed`);
      invalidate(queryKeys.images.all);
    } finally {
      setClearing(false);
    }
  };

  // The image lives on the MinIO origin, where the <a download> attribute is
  // ignored - fetch the bytes and save them ourselves, falling back to opening
  // the file if the bucket won't answer a cross-origin fetch.
  const handleDownload = async (item) => {
    const url = resolveMediaUrl(item.imageUrl);
    try {
      const blob = await (await fetch(url)).blob();
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = item.fileName || `${item._id}.png`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    } catch {
      window.open(url, "_blank", "noopener");
    }
  };

  const onKeyDown = (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === "Enter" && !submitting) handleGenerate();
  };

  return (
    <div>
      <div className="mb-4 flex items-center gap-3">
        <h1 className="text-xl font-semibold tracking-tight text-text-primary">Image Studio</h1>
        <Badge variant="accent" icon={<ImagePlus className="size-3" />}>
          Text to Image
        </Badge>
      </div>

      {/* Prompt bar: one compact card - prompt on the left, options and the
          action on the right - so the gallery gets the page. */}
      <Card className="animate-slide-up p-3 sm:p-4">
        <div className="flex flex-col gap-3 lg:flex-row">
          <Textarea
            ref={promptRef}
            rows={3}
            aria-label="Prompt"
            value={prompt}
            maxLength={MAX_CHARS}
            onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={onKeyDown}
            className="min-w-0 flex-1 resize-none"
            placeholder="Describe the picture: subject, setting, lighting, style... e.g. A misty mountain valley at sunrise, golden light through the clouds, realistic photo"
          />

          <div className="flex shrink-0 flex-col gap-2 lg:w-72">
            <Segmented label="Shape" options={ASPECTS} value={aspectRatio} onChange={setAspectRatio} />
            <div className="flex gap-2">
              <Segmented label="Quality" options={QUALITIES} value={quality} onChange={setQuality} className="w-44 shrink-0" />
              <Button
                className="min-w-0 flex-1"
                variant="primary"
                icon={submitting ? <Loader2 className="size-4 animate-spin" /> : <Wand2 className="size-4" />}
                disabled={submitting || prompt.trim().length < 3}
                onClick={handleGenerate}
              >
                {submitting ? "Starting" : "Generate"}
              </Button>
            </div>
          </div>
        </div>
        <p className="mt-2.5 text-xs text-text-tertiary">
          About a minute per image, ~35s on Fast. Queue several - they render one at a time. Ctrl+Enter generates. Text inside a picture usually comes out garbled.
        </p>
      </Card>

      <div className="mt-6 mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-baseline gap-2">
          <h2 className="text-[15px] font-semibold text-text-primary">Gallery</h2>
          <span className="text-xs text-text-tertiary">
            {history.length} image{history.length === 1 ? "" : "s"}
            {rendering ? ` · ${rendering} rendering` : ""}
          </span>
        </div>
        {failed.length > 0 && (
          <Button variant="ghost" size="xs" icon={<Trash2 className="size-3.5" />} loading={clearing} onClick={handleClearFailed}>
            Clear {failed.length} failed
          </Button>
        )}
      </div>

      {historyLoading ? (
        <div className="flex justify-center py-12">
          <Spinner size="sm" />
        </div>
      ) : historyError && history.length === 0 ? (
        <Card className="flex flex-col items-center gap-2 py-10 text-center">
          <p className="text-[13px] text-danger-500">{historyError.friendlyMessage || "Failed to load images"}</p>
          <p className="text-xs text-text-tertiary">Your images are safe on the server - this just couldn't load them.</p>
          <Button variant="secondary" size="sm" icon={<RefreshCw className="size-3.5" />} onClick={() => refetch()}>
            Retry
          </Button>
        </Card>
      ) : history.length === 0 ? (
        <Card className="flex flex-col items-center gap-2 py-14 text-center text-text-tertiary">
          <ImagePlus className="size-8" />
          <p className="text-[13px]">Generated images will appear here.</p>
        </Card>
      ) : (
        // Masonry: columns of tiles keep their own aspect ratio, so mixed
        // landscape / portrait / square images pack without gaps.
        <div className="columns-1 gap-4 sm:columns-2 lg:columns-3 2xl:columns-4">
          {history.map((item) => (
            <ImageTile
              key={item._id}
              item={item}
              progress={progress?.[item._id]}
              deleting={deletingId === item._id}
              onOpen={setPreview}
              onDelete={handleDelete}
              onDownload={handleDownload}
              onReuse={handleReuse}
              onVariation={handleVariation}
            />
          ))}
        </div>
      )}

      <Modal
        open={Boolean(preview)}
        onClose={() => setPreview(null)}
        title="Image"
        width="xl"
        footer={
          preview && (
            <Button variant="secondary" size="sm" icon={<Download className="size-3.5" />} onClick={() => handleDownload(preview)}>
              Download
            </Button>
          )
        }
      >
        {preview && (
          <>
            <img src={resolveMediaUrl(preview.imageUrl)} alt={preview.prompt} className="w-full rounded-lg" />
            <p className="mt-3 text-[13px] text-text-secondary">{preview.prompt}</p>
          </>
        )}
      </Modal>
    </div>
  );
};

export default ImagesPage;
