import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Pause, Play } from "lucide-react";
import { buildStudioPreview, getStudioThumbnailUrl, resolveSceneAudioUrl } from "../../services/api";
import { getSceneStartSeconds, settleOffsetFor } from "./sceneTiming";

// Live-ish preview of a course/video's scenes using the real HyperFrames
// pipeline (a scratch composition rebuilt on scene edits + per-frame PNG
// thumbnails from its preview server - see PreviewService.js), rather than
// @remotion/player's frame-accurate 60fps <Player>. Scrubbing/seeking fetches
// one thumbnail frame; "Play" advances through thumbnails at a fixed
// interval alongside the scene's real narration audio, which stays the
// timing authority. This is also the ONLY thing that calls buildStudioPreview
// for a job's scenes - SceneThumbnail elsewhere on the same page just reads
// the composition this builds, rather than each triggering its own build
// (the backend runs one shared preview server per job; concurrent builds
// would race and stomp each other's content).
const SCRUB_INTERVAL_MS = 250;
// How long to wait after the last edit before rebuilding the shared preview
// composition - see the effect below for why this needs to not fire per keystroke.
const REBUILD_DEBOUNCE_MS = 1200;

// Cheap content fingerprint so the scratch preview only rebuilds when scene
// content actually changes, not on every parent re-render (e.g. while the
// editor's active-scene index changes but the scenes themselves don't).
// Includes `templateId` and `elements` (not just title/subtitle/duration) -
// switching templates or editing a template's own fields (e.g. a
// Specs-Checklist scene's list items) doesn't touch any of the top-level
// scene fields, so a fingerprint without these silently never rebuilds.
const sceneFingerprint = (scenes) =>
  JSON.stringify(
    (scenes || []).map((s) => ({
      t: s.title,
      st: s.subtitle,
      d: s.duration,
      ty: s.sceneType,
      tpl: s.templateId,
      a: s.audio?.file,
      el: s.elements,
    }))
  );

// `focusIndex` / `onActiveSceneChange` let a parent editor stay in sync with
// the preview: clicking a scene in an edit form seeks the preview there, and
// clicking a chip here updates which scene the editor highlights.
export function ScenePreview({ scenes = [], focusIndex, onActiveSceneChange, hideChips = false, videoId }) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [frameTime, setFrameTime] = useState(settleOffsetFor(scenes[0]?.duration));
  // Gates rendering the thumbnail <img> - the backend 500s a thumbnail
  // request for a jobId with no active preview yet (see PreviewService.js),
  // so the first frame can't be requested until the initial build resolves.
  const [previewReady, setPreviewReady] = useState(false);
  const audioRef = useRef(null);
  const intervalRef = useRef(null);
  const lastFocusRef = useRef(focusIndex);

  const sceneStarts = useMemo(() => getSceneStartSeconds(scenes), [scenes]);
  const fingerprint = sceneFingerprint(scenes);

  // Keep the scratch composition in sync with whatever the editor currently
  // holds (including unsaved edits) - rebuilt whenever scene content changes.
  // Debounced: rebuilding restarts the actual `hyperframes preview` process
  // (see PreviewService.js - the running server does not pick up composition
  // file changes on its own, confirmed by direct testing), which costs
  // several seconds, so this waits for a pause in edits rather than firing
  // on every keystroke of a Title/Subtitle field.
  useEffect(() => {
    if (!videoId || scenes.length === 0) return;
    let cancelled = false;
    const timer = setTimeout(() => {
      buildStudioPreview(videoId, { scenes })
        .then(() => {
          if (!cancelled) setPreviewReady(true);
        })
        .catch(() => {});
    }, REBUILD_DEBOUNCE_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [videoId, fingerprint]);

  const stopPlayback = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    if (audioRef.current) {
      audioRef.current.onended = null;
      audioRef.current.pause();
      audioRef.current = null;
    }
    setIsPlaying(false);
  }, []);

  useEffect(() => stopPlayback, [stopPlayback]);

  const seekToScene = useCallback(
    (index) => {
      stopPlayback();
      setFrameTime((sceneStarts[index] || 0) + settleOffsetFor(scenes[index]?.duration));
      setActiveIndex(index);
      lastFocusRef.current = index;
      onActiveSceneChange?.(index);
    },
    [sceneStarts, scenes, onActiveSceneChange, stopPlayback]
  );

  useEffect(() => {
    if (focusIndex == null || focusIndex === lastFocusRef.current) return;
    lastFocusRef.current = focusIndex;
    seekToScene(focusIndex);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusIndex]);

  const togglePlay = useCallback(() => {
    if (isPlaying) {
      stopPlayback();
      return;
    }
    const scene = scenes[activeIndex];
    if (!scene) return;
    const sceneStart = sceneStarts[activeIndex] || 0;
    const duration = scene.duration || 8;
    const audioUrl = scene.audio?.file ? resolveSceneAudioUrl(videoId, scene.audio.file) : null;
    const startedAt = performance.now();

    setIsPlaying(true);
    if (audioUrl) {
      const audio = new Audio(audioUrl);
      audioRef.current = audio;
      audio.play().catch(() => {});
      audio.onended = stopPlayback;
    }
    intervalRef.current = setInterval(() => {
      const elapsed = audioRef.current ? audioRef.current.currentTime : (performance.now() - startedAt) / 1000;
      if (elapsed >= duration) {
        stopPlayback();
        return;
      }
      setFrameTime(sceneStart + elapsed);
    }, SCRUB_INTERVAL_MS);
  }, [isPlaying, scenes, activeIndex, sceneStarts, videoId, stopPlayback]);

  if (scenes.length === 0 || !videoId) return null;

  return (
    <div className="flex flex-col gap-3">
      <div className="relative overflow-hidden rounded-lg border border-border-light bg-black" style={{ aspectRatio: "16 / 9" }}>
        {previewReady && (
          <img
            src={getStudioThumbnailUrl(videoId, frameTime)}
            alt=""
            className="h-full w-full"
            style={{ objectFit: "contain" }}
          />
        )}
        <button
          type="button"
          onClick={togglePlay}
          className="absolute bottom-2 left-2 cursor-pointer rounded-full bg-black/60 p-2 text-white hover:bg-black/80"
        >
          {isPlaying ? <Pause className="size-4" /> : <Play className="size-4" />}
        </button>
      </div>
      {!hideChips && (
        <div className="flex gap-1.5 overflow-x-auto pb-1">
          {scenes.map((scene, i) => (
            <button
              key={i}
              type="button"
              onClick={() => seekToScene(i)}
              className={`shrink-0 cursor-pointer rounded-md border px-2.5 py-1 text-xs font-medium transition-colors ${
                i === activeIndex
                  ? "border-accent bg-accent-subtle text-accent"
                  : "border-border-light text-text-tertiary hover:text-text-primary"
              }`}
            >
              Scene {scene.sceneNumber || i + 1}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
