/**
 * Where each scene sits in the finished video.
 *
 * Follows what actually gets rendered. RemotionService.prepareAssets gives each
 * scene `audio.duration || duration || 8` seconds - the narration's own length
 * wins over the scripted one - and calculateVideoMetadata sums those and rounds
 * once. Scene starts are laid out back to back at whole frames (30 fps), the
 * way VideoComposition and utils/subtitles.js place them.
 */
const FPS = 30;
const DEFAULT_SCENE_SECONDS = 8;

/** The seconds this scene is rendered for. */
const renderedSeconds = (scene) => Number(scene?.audio?.duration) || Number(scene?.duration) || DEFAULT_SCENE_SECONDS;

const sceneSeconds = (scene) => Math.round(renderedSeconds(scene) * FPS) / FPS;

/**
 * `[{ sceneNumber, startSec, endSec, narrated, scene }]`. `narrated` means the
 * script gave the scene narration to speak - the only scenes whose audio is
 * expected to be audible.
 */
function buildTimeline(scenes) {
  let cursor = 0;
  return (Array.isArray(scenes) ? scenes : []).map((scene, index) => {
    const length = sceneSeconds(scene);
    const entry = {
      sceneNumber: scene?.sceneNumber ?? index + 1,
      startSec: cursor,
      endSec: cursor + length,
      narrated: String(scene?.audio?.text || '').trim().length > 0 && Number(scene?.audio?.duration) > 0,
      scene,
    };
    cursor += length;
    return entry;
  });
}

/**
 * Total length the script says the video should have - the composition's own
 * formula (calculateVideoMetadata): the scene lengths summed, rounded to a
 * whole frame once, never less than one second.
 */
function expectedDurationSec(timeline) {
  if (timeline.length === 0) return 0;
  const total = timeline.reduce((sum, t) => sum + renderedSeconds(t.scene), 0);
  return Math.max(Math.round(total * FPS), FPS) / FPS;
}

/** The scene playing at `second`, or null past the end. */
function sceneAt(timeline, second) {
  return timeline.find((t) => second >= t.startSec && second < t.endSec) || null;
}

module.exports = { FPS, DEFAULT_SCENE_SECONDS, renderedSeconds, sceneSeconds, buildTimeline, expectedDurationSec, sceneAt };
