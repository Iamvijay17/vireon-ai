import { useState, useRef, useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { ImagePlus, RefreshCw, Trash2, Search, SearchX } from "lucide-react";
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
import { Spinner } from "../../components/ui/Spinner";
import { Input } from "../../components/ui/Input";
import { toast } from "../../components/ui/toastBus";
import { confirmDialog } from "../../components/ui/confirmBus";
import { PromptBar } from "./PromptBar";
import { ImageTile } from "./ImageTile";
import { ImagePreview } from "./ImagePreview";
import { Segmented } from "./Segmented";
import { loadStudioSettings, saveStudioSettings, pipesToLines, linesToPipes, MAX_TEXT_LINES } from "./constants";

// While something renders: the list is re-checked every few seconds (a safety
// net - a finished render is noticed sooner, see the effect below), and the
// in-memory progress endpoint every second for the live percentage.
const LIST_POLL_MS = 3000;
const PROGRESS_POLL_MS = 1000;
const EMPTY = [];

const SHAPE_FILTERS = [
  { value: "all", label: "All" },
  { value: "16:9", label: "Landscape" },
  { value: "9:16", label: "Portrait" },
  { value: "1:1", label: "Square" },
];

// 4:5 is stored as the portrait size, so it filters with portrait.
const shapeOf = (item) => (item.aspectRatio === "4:5" ? "9:16" : item.aspectRatio);

const ImagesPage = () => {
  const [prompt, setPrompt] = useState("");
  const [negative, setNegative] = useState("");
  const [text, setText] = useState("");
  const [opts, setOpts] = useState(loadStudioSettings);
  const [seed, setSeed] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [deletingId, setDeletingId] = useState(null);
  const [clearing, setClearing] = useState(false);
  const [preview, setPreview] = useState(null);
  const [search, setSearch] = useState("");
  const [shapeFilter, setShapeFilter] = useState("all");
  const promptRef = useRef(null);
  const invalidate = useInvalidate();

  const setOpt = (key, value) => setOpts((o) => ({ ...o, [key]: value }));

  useEffect(() => {
    saveStudioSettings(opts);
  }, [opts]);

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

  const visible = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return history.filter(
      (h) => (shapeFilter === "all" || shapeOf(h) === shapeFilter) && (!needle || h.prompt.toLowerCase().includes(needle))
    );
  }, [history, search, shapeFilter]);
  const filtered = search.trim() !== "" || shapeFilter !== "all";

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

  const startGeneration = async (params) => {
    try {
      setSubmitting(true);
      await generateImage(params);
      await invalidate(queryKeys.images.all);
    } catch (err) {
      const detail = err.response?.data?.details?.[0]?.message;
      toast.error(err.response?.data?.message || detail || err.friendlyMessage || "Failed to start image generation");
    } finally {
      setSubmitting(false);
    }
  };

  const handleGenerate = () => {
    const promptText = prompt.trim();
    if (promptText.length < 3) {
      toast.error("Describe the image you want");
      return;
    }
    const pictureText = pipesToLines(text);
    if (pictureText.split("\n").filter(Boolean).length > MAX_TEXT_LINES) {
      toast.error(`Text in the picture can have at most ${MAX_TEXT_LINES} lines`);
      return;
    }
    startGeneration({
      prompt: promptText,
      aspectRatio: opts.aspectRatio,
      quality: opts.quality,
      style: opts.style,
      negative: negative.trim(),
      text: pictureText,
      // A pinned seed makes every image of a batch identical, so it means one image.
      count: seed ? 1 : opts.count,
      seed: seed ? Number(seed) : null,
    });
  };

  // "Another variation": same prompt and options, a fresh random seed.
  const handleVariation = (item) =>
    startGeneration({
      prompt: item.prompt,
      aspectRatio: item.aspectRatio,
      quality: item.quality || "standard",
      style: item.style || "none",
      negative: item.negative || "",
      text: item.text || "",
      count: 1,
      seed: null,
    });

  const handleReuse = (item, { withSeed = false } = {}) => {
    setPrompt(item.prompt);
    setNegative(item.negative || "");
    setText(linesToPipes(item.text));
    setOpts({
      aspectRatio: item.aspectRatio === "4:5" ? "9:16" : item.aspectRatio,
      quality: item.quality || "standard",
      style: item.style || "none",
      count: 1,
    });
    setSeed(withSeed && item.seed != null ? String(item.seed) : "");
    setPreview(null);
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

  return (
    <div>
      <div className="mb-4 flex items-center gap-3">
        <h1 className="text-xl font-semibold tracking-tight text-text-primary">Image Studio</h1>
        <Badge variant="accent" icon={<ImagePlus className="size-3" />}>
          Text to Image
        </Badge>
      </div>

      <PromptBar
        promptRef={promptRef}
        prompt={prompt}
        setPrompt={setPrompt}
        negative={negative}
        setNegative={setNegative}
        text={text}
        setText={setText}
        opts={opts}
        setOpt={setOpt}
        seed={seed}
        setSeed={setSeed}
        submitting={submitting}
        onGenerate={handleGenerate}
      />

      <div className="mt-6 mb-3 flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <div className="flex items-baseline gap-2">
          <h2 className="text-[15px] font-semibold text-text-primary">Gallery</h2>
          <span className="text-xs text-text-tertiary">
            {filtered ? `${visible.length} of ${history.length}` : history.length} image{history.length === 1 ? "" : "s"}
            {rendering ? ` · ${rendering} rendering` : ""}
          </span>
        </div>

        {history.length > 0 && (
          <div className="flex flex-wrap items-center gap-2">
            <div className="w-48">
              <Input
                icon={<Search className="size-3.5" />}
                aria-label="Search prompts"
                placeholder="Search prompts"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="h-8 text-[13px]"
              />
            </div>
            <Segmented label="Filter by shape" options={SHAPE_FILTERS} value={shapeFilter} onChange={setShapeFilter} />
            {failed.length > 0 && (
              <Button variant="ghost" size="xs" icon={<Trash2 className="size-3.5" />} loading={clearing} onClick={handleClearFailed}>
                Clear {failed.length} failed
              </Button>
            )}
          </div>
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
      ) : visible.length === 0 ? (
        <Card className="flex flex-col items-center gap-2 py-12 text-center text-text-tertiary">
          <SearchX className="size-7" />
          <p className="text-[13px]">No images match.</p>
          <Button
            variant="ghost"
            size="xs"
            onClick={() => {
              setSearch("");
              setShapeFilter("all");
            }}
          >
            Clear filters
          </Button>
        </Card>
      ) : (
        // Masonry: columns of tiles keep their own aspect ratio, so mixed
        // landscape / portrait / square images pack without gaps.
        <div className="columns-1 gap-4 sm:columns-2 lg:columns-3 2xl:columns-4">
          {visible.map((item) => (
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

      <ImagePreview
        item={preview}
        onClose={() => setPreview(null)}
        onDownload={handleDownload}
        onReuseSettings={(item) => handleReuse(item, { withSeed: true })}
      />
    </div>
  );
};

export default ImagesPage;
