// Shared scene-timing helpers for the HyperFrames preview components
// (ScenePreview, SceneThumbnail) - split into their own module (rather than
// exported from SceneThumbnail.jsx alongside its component) because a file
// that exports both components and plain functions breaks Vite's fast
// refresh for that file.

// A settled-frame offset into a scene - most templates fade/slide their
// title in over roughly their first second, so landing exactly on frame 0
// would show a still-invisible/mid-fade title.
const SETTLE_SECONDS_BASE = 1.33;
export const settleOffsetFor = (sceneDurationSeconds) => Math.min(SETTLE_SECONDS_BASE, (sceneDurationSeconds || 8) / 2);

// Cumulative start time (seconds) of each scene in a list, in composition
// order - shared by every caller that needs to know where a given scene
// lands in the whole-video preview timeline.
export const getSceneStartSeconds = (scenes) => {
  let t = 0;
  return (scenes || []).map((scene) => {
    const start = t;
    t += scene.duration || 8;
    return start;
  });
};
