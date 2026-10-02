import { useMemo } from "react";
import { Thumbnail } from "@remotion/player";
import { VideoComposition } from "vireon-remotion-templates/src/VideoComposition";
import { FPS } from "vireon-remotion-templates/src/calculateVideoMetadata";
import { resolveMediaUrl } from "../../services/api";

// A single static frame of a scene, rendered through the same template the
// scene actually uses — for the timeline strip, where a full <Player> per
// scene would be needlessly expensive.
//
// `jobId` must be the real job/video id: the generative template seeds its
// palette and font pairing from it, and the final render uses the real id. The
// old hard-coded "preview" made every thumbnail a different random style from
// the video (and from the main preview).
export function SceneThumbnail({ scene, className, jobId }) {
  const previewScene = useMemo(() => {
    const elements = scene.elements || {};
    return {
      ...scene,
      audio: undefined,
      elements: { ...elements, image: elements.image ? resolveMediaUrl(elements.image) : elements.image },
    };
  }, [scene]);

  // Stable identity: a new object each render re-renders the thumbnail's whole
  // composition on every parent render, and the timeline shows one per scene.
  const inputProps = useMemo(
    () => ({ assets: { scenes: [previewScene] }, jobId: jobId || "preview" }),
    [previewScene, jobId],
  );

  const durationInFrames = Math.max(Math.round((scene.duration || 8) * FPS), 1);
  const frameToDisplay = Math.min(Math.round(FPS * 0.5), durationInFrames - 1);

  return (
    <Thumbnail
      component={VideoComposition}
      inputProps={inputProps}
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
