import { useState, useRef, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { ImagePlus, Wand2, Loader2, RefreshCw, Download } from "lucide-react";
import {
  generateImage,
  getImageGenerations,
  getImageProgress,
  deleteImageGeneration,
  resolveMediaUrl,
} from "../../services/api";
import { queryKeys } from "../../lib/queryClient";
import { useApiQuery, useInvalidate } from "../../lib/useApiQuery";
import { Card, CardHeader } from "../../components/ui/Card";
import { Badge } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import { Modal } from "../../components/ui/Modal";
import { Spinner } from "../../components/ui/Spinner";
import { Textarea, Label, FieldHint } from "../../components/ui/Input";
import { cn } from "../../components/ui/cn";
import { toast } from "../../components/ui/toastBus";
import { confirmDialog } from "../../components/ui/confirmBus";
import { ImageTile } from "./ImageTile";

const MAX_CHARS = 1000;

// 4:5 is accepted by the API but maps to the portrait size, so only the
// shapes that really produce a distinct picture are offered.
const ASPECTS = [
  { value: "16:9", label: "Landscape", hint: "16:9", box: "h-3.5 w-6" },
  { value: "9:16", label: "Portrait", hint: "9:16", box: "h-6 w-3.5" },
  { value: "1:1", label: "Square", hint: "1:1", box: "h-5 w-5" },
];

// While something renders: the list is re-checked every few seconds (a safety
// net - a finished render is noticed sooner, see the effect below), and the
// in-memory progress endpoint every second for the live percentage.
const LIST_POLL_MS = 3000;
const PROGRESS_POLL_MS = 1000;
const EMPTY = [];

const ImagesPage = () => {
  const [prompt, setPrompt] = useState("");
  const [aspectRatio, setAspectRatio] = useState("16:9");
  const [submitting, setSubmitting] = useState(false);
  const [deletingId, setDeletingId] = useState(null);
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
  const hasPending = history.some((h) => h.status === "PENDING");

  // Plain useQuery, not useApiQuery: that toasts every failure, which at one
  // poll a second would bury the page if the API blipped. Progress is cosmetic.
  const { data: progress } = useQuery({
    queryKey: queryKeys.images.progress(),
    queryFn: async () => (await getImageProgress()).data.active || {},
    enabled: hasPending,
    refetchInterval: PROGRESS_POLL_MS,
    retry: false,
  });

  // A pending image that is no longer running on the server has finished (or
  // was orphaned): pull the list now instead of waiting for the next poll.
  useEffect(() => {
    if (progress && history.some((h) => h.status === "PENDING" && !(h._id in progress))) refetch();
  }, [progress, history, refetch]);

  const startGeneration = async (text, ratio) => {
    try {
      setSubmitting(true);
      await generateImage({ prompt: text, aspectRatio: ratio });
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
    startGeneration(text, aspectRatio);
  };

  const handleVariation = (item) => startGeneration(item.prompt, item.aspectRatio);

  const handleReuse = (item) => {
    setPrompt(item.prompt);
    setAspectRatio(item.aspectRatio === "4:5" ? "9:16" : item.aspectRatio);
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

  const rendering = history.filter((h) => h.status === "PENDING").length;

  return (
    <div>
      <div className="mb-5 flex items-center gap-3">
        <h1 className="text-xl font-semibold tracking-tight text-text-primary">Image Studio</h1>
        <Badge variant="accent" icon={<ImagePlus className="size-3" />}>
          Text to Image
        </Badge>
      </div>

      {/* Composer: a wide bar on top, so the gallery below gets the full page width. */}
      <Card className="animate-slide-up">
        <div className="grid grid-cols-1 gap-5 p-4 sm:p-5 lg:grid-cols-[minmax(0,1fr)_300px]">
          <div>
            <Label required>Prompt</Label>
            <Textarea
              ref={promptRef}
              rows={4}
              value={prompt}
              maxLength={MAX_CHARS}
              onChange={(e) => setPrompt(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder="Describe the picture: subject, setting, lighting, style... e.g. A misty mountain valley at sunrise, golden light through the clouds, realistic photo"
            />
            <FieldHint>
              {prompt.length}/{MAX_CHARS} characters. Text inside the picture usually comes out garbled - add captions in the video instead.
            </FieldHint>
          </div>

          <div className="flex flex-col">
            <Label>Shape</Label>
            <div className="grid grid-cols-3 gap-2">
              {ASPECTS.map((a) => (
                <button
                  key={a.value}
                  type="button"
                  onClick={() => setAspectRatio(a.value)}
                  aria-pressed={aspectRatio === a.value}
                  className={cn(
                    "flex cursor-pointer flex-col items-center gap-1 rounded-lg border px-2 py-2.5 text-xs font-medium transition-colors",
                    aspectRatio === a.value
                      ? "border-accent bg-accent-subtle text-accent"
                      : "border-border text-text-secondary hover:bg-surface-hover"
                  )}
                >
                  <span className="flex h-6 items-center">
                    <span className={cn("rounded-[3px] border-2 border-current", a.box)} />
                  </span>
                  <span>{a.label}</span>
                  <span className="text-[10px] font-normal opacity-70">{a.hint}</span>
                </button>
              ))}
            </div>

            <Button
              className="mt-4 w-full lg:mt-auto"
              variant="primary"
              size="lg"
              icon={submitting ? <Loader2 className="size-4 animate-spin" /> : <Wand2 className="size-4" />}
              disabled={submitting || prompt.trim().length < 3}
              onClick={handleGenerate}
            >
              {submitting ? "Starting..." : "Generate Image"}
            </Button>
            <p className="mt-2 text-center text-xs text-text-tertiary">
              About a minute per image on the local GPU. Queue several - they render one at a time. Ctrl+Enter also generates.
            </p>
          </div>
        </div>
      </Card>

      <Card className="mt-4 animate-slide-up" style={{ "--stagger-index": 0.5 }}>
        <CardHeader
          title="Gallery"
          subtitle={`${history.length} image${history.length === 1 ? "" : "s"}${rendering ? ` - ${rendering} rendering` : ""}`}
        />
        <div className="p-4 sm:p-5">
          {historyLoading ? (
            <div className="flex justify-center py-10">
              <Spinner size="sm" />
            </div>
          ) : historyError && history.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-8 text-center">
              <p className="text-[13px] text-danger-500">{historyError.friendlyMessage || "Failed to load images"}</p>
              <p className="text-xs text-text-tertiary">Your images are safe on the server - this just couldn't load them.</p>
              <Button variant="secondary" size="sm" icon={<RefreshCw className="size-3.5" />} onClick={() => refetch()}>
                Retry
              </Button>
            </div>
          ) : history.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-12 text-center text-text-tertiary">
              <ImagePlus className="size-8" />
              <p className="text-[13px]">Generated images will appear here.</p>
            </div>
          ) : (
            // Masonry: columns of tiles keep their own aspect ratio, so mixed
            // landscape / portrait / square images pack without gaps.
            <div className="columns-1 gap-4 sm:columns-2 xl:columns-3 2xl:columns-4">
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
        </div>
      </Card>

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
