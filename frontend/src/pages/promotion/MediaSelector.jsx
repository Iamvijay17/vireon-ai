import { useMemo, useRef, useState } from "react";
import { Film, GraduationCap, Upload, Search, X, Check, ImageIcon } from "lucide-react";
import { Tabs } from "../../components/ui/Tabs";
import { Input } from "../../components/ui/Input";
import { Button } from "../../components/ui/Button";
import { Badge } from "../../components/ui/Badge";
import { Alert } from "../../components/ui/Alert";
import { Progress } from "../../components/ui/Progress";
import { cn } from "../../components/ui/cn";
import { ErrorState } from "../../components";
import { useSocialLibrary } from "./usePromotion";
import { MediaThumb, SkeletonRows } from "./shared";
import { formatSeconds, formatBytes } from "./format";

const ACCEPT = "image/jpeg,image/png,video/mp4,video/quicktime";

/** What the chosen media is, with the facts the platforms' rules are checked against. */
export const MediaSummary = ({ campaign, onClear, disabled }) => {
  const media = campaign?.media;
  if (!media) return null;
  const facts = [
    media.kind === "video" ? "Video" : "Image",
    media.width && media.height ? `${media.width}×${media.height}` : null,
    media.durationSec ? formatSeconds(media.durationSec) : null,
    formatBytes(media.size),
    media.contentType,
  ].filter(Boolean);
  return (
    <div className="flex items-center gap-3 rounded-xl border border-border-light bg-surface-hover/50 p-3">
      <MediaThumb media={media} thumbnail={campaign.thumbnail} className="size-16 shrink-0 rounded-lg" alt="Selected media" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-[14px] font-semibold text-text-primary">{campaign.source?.title || media.fileName || "Uploaded file"}</p>
        <p className="mt-0.5 text-xs text-text-tertiary">{facts.join(" · ")}</p>
        {media.kind === "video" && media.measured !== "file" && (
          <p className="mt-1 text-[11px] text-text-tertiary">
            {media.durationSec ? "Length and shape come from the generation record, not a measurement of the rendered file." : "The length of this video is unknown, so length limits can only be checked by the platform."}
          </p>
        )}
      </div>
      {onClear && <Button size="sm" variant="ghost" iconOnly icon={<X className="size-4" />} disabled={disabled} onClick={onClear} aria-label="Remove media" />}
    </div>
  );
};

const LibraryCard = ({ item, selected, onPick, disabled }) => (
  <button
    type="button" disabled={disabled} onClick={() => onPick(item)}
    className={cn(
      "group relative flex cursor-pointer flex-col overflow-hidden rounded-xl border text-left transition-colors disabled:cursor-not-allowed disabled:opacity-60",
      selected ? "border-accent ring-2 ring-accent/20" : "border-border-light hover:border-border"
    )}
  >
    <MediaThumb media={{ kind: "video" }} thumbnailUrl={item.thumbnailUrl} className="aspect-video w-full" />
    {selected && <span className="absolute right-2 top-2 flex size-6 items-center justify-center rounded-full bg-accent text-white"><Check className="size-3.5" /></span>}
    <div className="p-2.5">
      <p className="line-clamp-2 text-[13px] font-medium text-text-primary">{item.title}</p>
      <p className="mt-0.5 truncate text-[11px] text-text-tertiary">
        {[item.courseTitle, item.aspectRatio, formatSeconds(item.durationSec)].filter(Boolean).join(" · ")}
      </p>
    </div>
  </button>
);

/**
 * Choose what to promote: a finished Vireon video, a rendered course lesson, or an image / video you upload.
 * Nothing here posts anything - it only fills the promotion draft.
 */
export const MediaSelector = ({ campaign, caps, busy, uploadPercent, onPickVideo, onPickLesson, onUpload, onClear }) => {
  const [tab, setTab] = useState("videos");
  const [query, setQuery] = useState("");
  const [dragging, setDragging] = useState(false);
  const fileRef = useRef(null);
  const { data, loading, error, refetch } = useSocialLibrary();

  const q = query.trim().toLowerCase();
  const videos = useMemo(() => (data?.videos || []).filter((v) => !q || `${v.title} ${v.topic || ""}`.toLowerCase().includes(q)), [data, q]);
  const lessons = useMemo(() => (data?.lessons || []).filter((l) => !q || `${l.title} ${l.courseTitle || ""}`.toLowerCase().includes(q)), [data, q]);
  const uploads = caps?.uploads;

  const handleFiles = (files) => {
    const file = files?.[0];
    if (file) onUpload(file);
  };

  return (
    <div className="space-y-4">
      <MediaSummary campaign={campaign} onClear={campaign?.media ? onClear : null} disabled={busy} />

      <Tabs
        active={tab} onChange={setTab}
        items={[
          { key: "videos", label: "Videos", icon: <Film className="size-4" /> },
          { key: "lessons", label: "Course lessons", icon: <GraduationCap className="size-4" /> },
          { key: "upload", label: "Upload", icon: <Upload className="size-4" /> },
        ]}
      />

      {tab !== "upload" && (
        <>
          <Input icon={<Search className="size-4" />} placeholder="Search by title" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Search videos" />
          {loading && <SkeletonRows rows={2} />}
          {error && <ErrorState message="Could not load your videos" onRetry={refetch} />}
          {!loading && !error && tab === "videos" && (
            videos.length === 0
              ? <p className="py-8 text-center text-sm text-text-tertiary">{q ? "No video matches that search." : "No finished videos yet. Generate one in Create Video, then come back."}</p>
              : (
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
                  {videos.map((v) => <LibraryCard key={v.videoJobId} item={v} disabled={busy} selected={campaign?.source?.videoJobId === v.videoJobId} onPick={onPickVideo} />)}
                </div>
              )
          )}
          {!loading && !error && tab === "lessons" && (
            lessons.length === 0
              ? <p className="py-8 text-center text-sm text-text-tertiary">{q ? "No lesson matches that search." : "No rendered course lessons yet."}</p>
              : (
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
                  {lessons.map((l) => <LibraryCard key={l.courseVideoId} item={l} disabled={busy} selected={campaign?.source?.courseVideoId === l.courseVideoId} onPick={onPickLesson} />)}
                </div>
              )
          )}
        </>
      )}

      {tab === "upload" && (
        <div className="space-y-3">
          <div
            onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => { e.preventDefault(); setDragging(false); handleFiles(e.dataTransfer.files); }}
            className={cn("flex flex-col items-center gap-3 rounded-xl border-2 border-dashed p-8 text-center transition-colors", dragging ? "border-accent bg-accent-subtle" : "border-border")}
          >
            <ImageIcon className="size-8 text-text-tertiary" />
            <p className="text-sm text-text-secondary">Drop a JPEG / PNG image or an MP4 / MOV video here</p>
            <input ref={fileRef} type="file" accept={ACCEPT} className="sr-only" aria-label="Choose a file to upload" onChange={(e) => { handleFiles(e.target.files); e.target.value = ""; }} />
            <Button variant="secondary" size="sm" icon={<Upload className="size-4" />} disabled={busy} onClick={() => fileRef.current?.click()}>Choose file</Button>
            {uploads && (
              <p className="text-xs text-text-tertiary">
                Images up to {formatBytes(uploads.maxImageBytes)}, videos up to {formatBytes(uploads.maxVideoBytes)}. The file&apos;s real type is checked on the server.
              </p>
            )}
          </div>
          {busy && uploadPercent > 0 && <Progress percent={uploadPercent} size="sm" />}
          <Alert type="info" title="Platform notes">
            Instagram accepts JPEG images only. Threads and Instagram images are fetched by Meta from a public URL, which this server must be set up to provide.
          </Alert>
        </div>
      )}
      {campaign?.media && <Badge variant="success" dot>Media selected</Badge>}
    </div>
  );
};

export default MediaSelector;
