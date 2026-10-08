/**
 * SceneGraph IR -> Remotion input props, in the exact shape
 * RemotionService.prepareAssets has always written to assets.json, so the
 * composition needs no changes and a shadow compile can be diffed against
 * the legacy output field for field.
 *
 * Pure function of the IR: two compiles of the same script + config give
 * the same props, which is what will let this step be cached by hash.
 */
const SYNTHESIZED_SCENE_ID = /^scene-\d+$/;

function toRenderProps(ir) {
  return {
    title: ir.title,
    description: ir.description,
    resolution: ir.video.resolution,
    aspectRatio: ir.video.aspectRatio,
    quality: ir.video.quality,
    fontPairing: ir.video.fontPairing,
    scenes: ir.scenes.map((scene) => ({
      sceneNumber: scene.sceneNumber,
      // Real ids only: the compiler synthesizes `scene-N` for scripts that never
      // had one, and the legacy builder (and the browser preview) leave those
      // undefined - passing the synthetic id would change their seed.
      sceneId: SYNTHESIZED_SCENE_ID.test(scene.sceneId || '') ? undefined : scene.sceneId,
      sceneType: scene.sceneType,
      title: scene.title,
      subtitle: scene.subtitle,
      // The composition treats 0 as "no duration" and the legacy path
      // substituted 8s; keep that so a shadow diff stays honest.
      duration: scene.timing.durationSeconds || 8,
      backgroundColor: scene.backgroundColor,
      transition: scene.transition,
      imagePrompt: scene.imagePrompt,
      cameraMotion: scene.cameraMotion,
      animation: scene.animation,
      imageUrl: scene.imageUrl,
      layout: scene.layout || '',
      templateId: scene.templateId,
      elements: scene.elements,
      ...(scene.speechTiming ? { speechTiming: scene.speechTiming } : {}),
      audio: {
        file: scene.audio.url,
        duration: scene.audio.durationSeconds,
        ...(scene.audio.timeline ? { timeline: scene.audio.timeline } : {}),
        ...(scene.audio.speech ? { speech: scene.audio.speech } : {}),
      },
      theme: {
        type: ir.video.type,
        textColor: '#ffffff',
        accentColor: '#6c63ff',
        captionAnimation: ir.video.captionAnimation,
      },
    })),
    output: {
      video: './render/video.mp4',
      thumbnail: './render/thumbnail.jpg',
    },
  };
}

// Legacy assets.json carried scene_meta, which no template reads (only an
// engine unit test references it) - the IR drops it on purpose.
const IGNORED_PATH = /^scenes\.\d+\.scene_meta$/;

/**
 * Paths at which two render-props objects differ - the shadow-mode signal
 * that the IR compiler and the legacy builder disagree about a job.
 */
function diffRenderProps(legacy, fromIr, path = '', out = []) {
  if (IGNORED_PATH.test(path)) return out;

  const isObj = (v) => v !== null && typeof v === 'object';
  if (!isObj(legacy) || !isObj(fromIr)) {
    if (legacy !== fromIr && !(legacy == null && fromIr == null)) {
      out.push({ path, legacy, ir: fromIr });
    }
    return out;
  }

  const keys = new Set([...Object.keys(legacy), ...Object.keys(fromIr)]);
  for (const key of keys) {
    diffRenderProps(legacy[key], fromIr[key], path ? `${path}.${key}` : key, out);
  }
  return out;
}

module.exports = { toRenderProps, diffRenderProps };
