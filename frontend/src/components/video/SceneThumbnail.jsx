import { useMemo } from "react";
import { Thumbnail } from "@remotion/player";
import { VideoComposition } from "vireon-remotion-templates/src/VideoComposition";
import { FPS } from "vireon-remotion-templates/src/calculateVideoMetadata";
import { resolveMediaUrl } from "../../services/api";

// A single static frame of a scene, rendered through the same template the
// scene actually uses — for the timeline strip, where a full <Player> per
// scene would be needlessly expensive.
export function SceneThumbnail({ scene, className }) {
  const previewScene = useMemo(() => {
    const elements = scene.elements || {};
    return {
      ...scene,
      audio: undefined,
      elements: { ...elements, image: elements.image ? resolveMediaUrl(elements.image) : elements.image },
    };
  }, [scene]);

  const durationInFrames = Math.max(Math.round((scene.duration || 8) * FPS), 1);
  const frameToDisplay = Math.min(Math.round(FPS * 0.5), durationInFrames - 1);

  return (
    <Thumbnail
      component={VideoComposition}
      inputProps={{ assets: { scenes: [previewScene] }, jobId: "preview" }}
      compositionWidth={1920}
      compositionHeight={1080}
      durationInFrames={durationInFrames}
      fps={FPS}
      frameToDisplay={frameToDisplay}
      style={{ width: "100%", height: "100%" }}
      className={className}
    />
  );
}
