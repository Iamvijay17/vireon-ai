import { useEffect, useRef, useState } from "react";
import { getStudioThumbnailUrl } from "../../services/api";
import { settleOffsetFor } from "./sceneTiming";

// Fast retries cover the common case (build already warm); once those are
// exhausted, fall back to slow polling rather than giving up - a cold build
// (first time this machine resolves the hyperframes CLI package) can take
// PreviewService's own full 300s timeout to come up, and giving up sooner
// than that leaves the thumbnail permanently black even after the preview
// becomes available (confirmed by direct testing: 6 fast retries at 700ms
// is only ~4s, well short of a real build).
const FAST_RETRY_COUNT = 6;
const FAST_RETRY_DELAY_MS = 700;
const SLOW_RETRY_DELAY_MS = 3000;
const MAX_RETRIES = 100;

// A single static frame, read from the shared preview build that
// ScenePreview (mounted alongside on every Studio page) already maintains -
// see backend/src/services/video/PreviewService.js: one composition per job,
// built once from the full scene list, read here by many thumbnails at
// different timestamps. Deliberately does NOT trigger its own build -
// concurrent single-scene builds from multiple thumbnails would race and
// stomp each other, since the backend runs one shared preview server per job.
//
// It does, however, retry on failure: this thumbnail can mount before
// ScenePreview's own build POST resolves (they're unrelated siblings, no
// shared "ready" state), so the very first request routinely lands on "no
// active preview yet" and would otherwise show a broken image forever.
export function SceneThumbnail({ videoId, startSeconds = 0, duration = 8, className }) {
  const [attempt, setAttempt] = useState(0);
  const [failed, setFailed] = useState(false);
  const timerRef = useRef(null);

  const t = startSeconds + settleOffsetFor(duration);

  useEffect(() => {
    setAttempt(0);
    setFailed(false);
  }, [videoId, t]);

  useEffect(() => () => clearTimeout(timerRef.current), []);

  if (!videoId) {
    return <div className={className} style={{ width: "100%", height: "100%", background: "#000" }} />;
  }

  const handleError = () => {
    if (attempt >= MAX_RETRIES) {
      setFailed(true);
      return;
    }
    const delay = attempt < FAST_RETRY_COUNT ? FAST_RETRY_DELAY_MS : SLOW_RETRY_DELAY_MS;
    timerRef.current = setTimeout(() => setAttempt((a) => a + 1), delay);
  };

  if (failed) {
    return <div className={className} style={{ width: "100%", height: "100%", background: "#000" }} />;
  }

  return (
    <img
      // Cache-bust each retry - a failed request isn't cached by the browser,
      // but the identical URL would otherwise dedupe against the in-flight
      // failed one instead of firing a fresh request.
      src={`${getStudioThumbnailUrl(videoId, t)}${attempt ? `&retry=${attempt}` : ""}`}
      alt=""
      onError={handleError}
      className={className}
      style={{ width: "100%", height: "100%", objectFit: "cover", background: "#000" }}
    />
  );
}
