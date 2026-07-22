import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Player } from "@remotion/player";
import { VideoComposition } from "vireon-remotion-templates/src/VideoComposition";
import { calculateTotalDurationInFrames, FPS } from "vireon-remotion-templates/src/calculateVideoMetadata";
import { resolveMediaUrl } from "../../services/api";

// Live, in-browser preview of a course video's scenes using the same
// Remotion composition/templates the backend renders with — no server
// render and no audio (scene.audio is stripped before it reaches the
// templates, so the per-template `<Audio src={scene.audio.file}>` never
// fires).
const stripAudioAndResolveMedia = (scenes) =>
  (scenes || []).map((scene) => {
    const elements = scene.elements || {};
    return {
      ...scene,
      audio: undefined,
      imageUrl: scene.imageUrl ? resolveMediaUrl(scene.imageUrl) : scene.imageUrl,
      elements: {
        ...elements,
        image: elements.image ? resolveMediaUrl(elements.image) : elements.image,
      },
    };
  });

const getSceneStartFrames = (scenes) => {
  let frame = 0;
  return (scenes || []).map((scene) => {
    const start = frame;
    frame += Math.round((scene.duration || 8) * FPS);
    return start;
  });
};

// `focusIndex` / `onActiveSceneChange` let a parent editor stay in sync with
// the preview: clicking a scene in an edit form seeks the player there, and
// scrubbing/playing the player updates which scene the editor highlights.
export function ScenePreview({ scenes = [], focusIndex, onActiveSceneChange }) {
  const playerRef = useRef(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const lastFocusRef = useRef(focusIndex);

  const previewScenes = useMemo(() => stripAudioAndResolveMedia(scenes), [scenes]);
  const sceneStarts = useMemo(() => getSceneStartFrames(scenes), [scenes]);
  const durationInFrames = useMemo(() => calculateTotalDurationInFrames(scenes), [scenes]);

  const seekToScene = useCallback(
    (index) => {
      const player = playerRef.current;
      if (!player) return;
      player.pause();
      player.seekTo(sceneStarts[index] || 0);
      setActiveIndex(index);
    },
    [sceneStarts],
  );

  useEffect(() => {
    const player = playerRef.current;
    if (!player) return undefined;

    const onFrameUpdate = (e) => {
      const frame = e.detail.frame;
      let idx = 0;
      for (let i = 0; i < sceneStarts.length; i++) {
        if (frame >= sceneStarts[i]) idx = i;
      }
      setActiveIndex(idx);
      lastFocusRef.current = idx;
      onActiveSceneChange?.(idx);
    };

    player.addEventListener("frameupdate", onFrameUpdate);
    return () => player.removeEventListener("frameupdate", onFrameUpdate);
  }, [sceneStarts, onActiveSceneChange]);

  useEffect(() => {
    if (focusIndex == null || focusIndex === lastFocusRef.current) return;
    lastFocusRef.current = focusIndex;
    seekToScene(focusIndex);
  }, [focusIndex, seekToScene]);

  if (previewScenes.length === 0) return null;

  return (
    <div className="flex flex-col gap-3">
      <div className="overflow-hidden rounded-lg border border-border-light bg-black">
        <Player
          ref={playerRef}
          component={VideoComposition}
          inputProps={{ assets: { scenes: previewScenes }, jobId: "preview" }}
          durationInFrames={durationInFrames}
          fps={FPS}
          compositionWidth={1920}
          compositionHeight={1080}
          style={{ width: "100%" }}
          controls
          clickToPlay
          doubleClickToFullscreen
          loop
          showVolumeControls={false}
        />
      </div>
      <div className="flex gap-1.5 overflow-x-auto pb-1">
        {scenes.map((scene, i) => (
          <button
            key={i}
            type="button"
            onClick={() => seekToScene(i)}
            className={`shrink-0 rounded-md border px-2.5 py-1 text-xs font-medium transition-colors ${
              i === activeIndex
                ? "border-accent bg-accent-subtle text-accent"
                : "border-border-light text-text-tertiary hover:text-text-primary"
            }`}
          >
            Scene {scene.sceneNumber || i + 1}
          </button>
        ))}
      </div>
    </div>
  );
}
