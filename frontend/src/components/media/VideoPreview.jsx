import { useState } from "react";
import { TriangleAlert } from "lucide-react";
import { cn } from "../ui/cn";
import { resolveMediaUrl } from "../../services/api";

/**
 * A video player that does not download the file until asked (preload
 * "metadata" fetches only the header), re-homes MinIO loopback URLs for LAN
 * access, and says so when the file cannot be played instead of showing a
 * blank black box.
 */
const VideoPreview = ({ src, poster, portrait = false, className, autoPlay = false }) => {
  const [failed, setFailed] = useState(false);
  const url = resolveMediaUrl(src);
  const posterUrl = resolveMediaUrl(poster);

  return (
    <div className={cn("overflow-hidden rounded-lg bg-black", className)}>
      {failed || !url ? (
        <div
          className="flex flex-col items-center justify-center gap-2 px-4 text-center text-xs text-neutral-400"
          style={{ aspectRatio: portrait ? "9/16" : "16/9" }}
        >
          <TriangleAlert className="size-5 text-warning-500" />
          {url ? "This video could not be loaded. The file may be missing or still uploading." : "No video file is attached."}
        </div>
      ) : (
        <video
          key={url}
          src={url}
          poster={posterUrl || undefined}
          controls
          preload="metadata"
          autoPlay={autoPlay}
          onError={() => setFailed(true)}
          className="block w-full object-contain"
          style={{ aspectRatio: portrait ? "9/16" : "16/9", maxHeight: portrait ? "70vh" : undefined }}
        >
          Your browser does not support the video tag.
        </video>
      )}
    </div>
  );
};

export default VideoPreview;
