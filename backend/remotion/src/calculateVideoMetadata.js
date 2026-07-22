export const FPS = 30;
export const DEFAULT_SCENE_DURATION_SECONDS = 8;

/**
 * Shared by the Remotion Studio composition (server-side render) and the
 * frontend's live @remotion/player preview, so both agree on how long the
 * stitched video runs for a given set of scenes.
 */
export function calculateTotalDurationInFrames(scenes, fps = FPS) {
  const list = scenes || [];
  const totalSeconds = list.reduce(
    (sum, scene) => sum + (scene.duration || DEFAULT_SCENE_DURATION_SECONDS),
    list.length > 0 ? 0 : DEFAULT_SCENE_DURATION_SECONDS,
  );

  return Math.max(Math.round(totalSeconds * fps), fps);
}

export const calculateVideoMetadata = ({ props }) => {
  const scenes = props?.assets?.scenes || [];
  return {
    durationInFrames: calculateTotalDurationInFrames(scenes),
    fps: FPS,
  };
};
