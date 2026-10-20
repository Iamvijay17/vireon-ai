import { useState } from "react";
import { FileQuestion, ImageOff } from "lucide-react";
import { AudioPlayer } from "../ui/AudioPlayer";
import { resolveMediaUrl } from "../../services/api";
import VideoPreview from "./VideoPreview";
import { mediaKind } from "./mediaKind";

/**
 * Preview for one stored file, by kind: an image, a video player, an audio
 * player, or - for anything else - an honest "no preview" with the file name.
 * `item` is an Asset registry row ({ url, mimeType, fileName, category }).
 * Images load lazily; nothing is fetched until the preview is on screen.
 */
const MediaPreview = ({ item, className }) => {
  const [imageFailed, setImageFailed] = useState(false);
  const kind = mediaKind(item);
  const url = resolveMediaUrl(item?.url);

  if (kind === "image") {
    return imageFailed || !url ? (
      <div className="flex aspect-video flex-col items-center justify-center gap-2 rounded-lg border border-border bg-surface-hover text-xs text-text-tertiary">
        <ImageOff className="size-5" /> This image could not be loaded.
      </div>
    ) : (
      <div className={className}>
        <img
          src={url}
          alt={item.fileName || "Image preview"}
          loading="lazy"
          decoding="async"
          onError={() => setImageFailed(true)}
          className="mx-auto max-h-[60vh] w-auto max-w-full rounded-lg border border-border bg-black object-contain"
        />
      </div>
    );
  }

  if (kind === "video") return <VideoPreview src={item.url} className={className} />;

  if (kind === "audio") {
    return (
      <div className={className}>
        <div className="rounded-lg border border-border bg-surface-hover p-4">
          <AudioPlayer src={url} />
        </div>
      </div>
    );
  }

  return (
    <div className="flex aspect-video flex-col items-center justify-center gap-2 rounded-lg border border-border bg-surface-hover px-4 text-center text-xs text-text-tertiary">
      <FileQuestion className="size-5" />
      No preview for this kind of file.
      <span className="max-w-full truncate font-mono text-[11px]">{item?.fileName}</span>
    </div>
  );
};

export default MediaPreview;
