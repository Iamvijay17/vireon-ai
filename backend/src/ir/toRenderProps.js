/**
 * SceneGraph IR -> Remotion input props, in the exact shape
 * RemotionService.prepareAssets has always written to assets.json, so the
 * composition needs no changes and a shadow compile can be diffed against
 * the legacy output field for field.
 *
 * Pure function of the IR: two compiles of the same script + config give
 * the same props, which is what will let this step be cached by hash.
 */
function toRenderProps(ir) {
  return {
    title: ir.title,
    description: ir.description,
    resolution: ir.video.resolution,
    aspectRatio: ir.video.aspectRatio,
    quality: ir.video.quality,
    fontPairing: ir.video.fontPairing,
    avatar: ir.avatar
      ? { videoUrl: ir.avatar.videoUrl, position: ir.avatar.position }
      : undefined,
    scenes: ir.scenes.map((scene) => ({
      sceneNumber: scene.sceneNumber,
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
      templateId: scene.templateId,
      elements: scene.elements,
      audio: {
        file: scene.audio.url,
        duration: scene.audio.durationSeconds,
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
      thumbnail: './render/thumbnail.png',
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
