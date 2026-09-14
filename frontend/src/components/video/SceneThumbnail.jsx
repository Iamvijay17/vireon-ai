import { getStudioThumbnailUrl } from "../../services/api";
import { settleOffsetFor } from "./sceneTiming";

// A single static frame, read from the shared preview build that
// ScenePreview (mounted alongside on every Studio page) already maintains -
// see backend/src/services/video/PreviewService.js: one composition per job,
// built once from the full scene list, read here by many thumbnails at
// different timestamps. Deliberately does NOT trigger its own build -
// concurrent single-scene builds from multiple thumbnails would race and
// stomp each other, since the backend runs one shared preview server per job.
export function SceneThumbnail({ videoId, startSeconds = 0, duration = 8, className }) {
  if (!videoId) {
    return <div className={className} style={{ width: "100%", height: "100%", background: "#000" }} />;
  }
  const t = startSeconds + settleOffsetFor(duration);
  return (
    <img
      src={getStudioThumbnailUrl(videoId, t)}
      alt=""
      className={className}
      style={{ width: "100%", height: "100%", objectFit: "cover", background: "#000" }}
    />
  );
}
