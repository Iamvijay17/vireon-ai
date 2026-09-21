const { SceneGraph, IR_VERSION } = require('./schema');
const { SCENE_TYPES, resolveTemplate } = require('./templateRegistry');

// Mirrors remotion/src/calculateVideoMetadata.js's FPS - the composition
// derives its frame count from scene seconds at this rate.
const FPS = 30;

const IMAGE_BEARING = new Set(['image', 'contentwithimage']);

/**
 * Compile a stored script + job config into a SceneGraph and a list of
 * everything that would go wrong rendering it.
 *
 * Pure: no storage or DB access, so it's cheap enough to run at script
 * time (before any TTS/GPU spend) as well as right before render. `stage`
 * decides which checks apply - at 'script' there's legitimately no audio
 * or image yet, so those checks wait for 'render'.
 *
 * Never throws for bad input. Returns `{ ir, issues, ok }` where `ok` is
 * "no error-severity issues"; the caller decides whether that blocks.
 */
function compile({ jobId, script, jobConfig = {}, stage = 'render', audioUrlFor }) {
  const issues = [];
  const error = (scene, path, message) => issues.push({ severity: 'error', scene, path, message });
  const warn = (scene, path, message) => issues.push({ severity: 'warn', scene, path, message });

  if (!script || typeof script !== 'object') {
    error(null, '', 'script is missing');
    return { ir: null, issues, ok: false };
  }
  if (!script.title) warn(null, 'title', 'script has no title');

  const scenes = Array.isArray(script.scenes) ? script.scenes : [];
  if (scenes.length === 0) {
    error(null, 'scenes', 'script has no scenes');
    return { ir: null, issues, ok: false };
  }

  const seen = new Set();
  const irScenes = scenes.map((scene, index) => {
    const sceneNumber = scene.sceneNumber ?? index + 1;
    const label = sceneNumber;

    if (scene.sceneNumber == null) error(label, 'sceneNumber', 'missing sceneNumber');
    else if (seen.has(sceneNumber)) error(label, 'sceneNumber', 'duplicate sceneNumber');
    seen.add(sceneNumber);

    // Same positional fallback RemotionService.prepareAssets applies, so a
    // shadow compile matches legacy output - but it's a smell worth naming.
    let sceneType = scene.sceneType;
    if (!sceneType) {
      sceneType = sceneNumber === 1 ? 'title' : 'content';
      warn(label, 'sceneType', `no sceneType - inferred "${sceneType}" from position`);
    }
    if (!SCENE_TYPES.includes(sceneType)) {
      error(label, 'sceneType', `unknown sceneType "${sceneType}"`);
    }

    const templateId = scene.templateId || '';
    let template = null;
    if (!templateId) {
      error(label, 'templateId', 'no templateId - Remotion would render DefaultTemplate');
    } else {
      template = resolveTemplate(templateId, sceneType);
      if (!template) {
        error(label, 'templateId', `"${templateId}" is not a registered template - Remotion would render DefaultTemplate`);
      } else if (template.sceneType !== sceneType) {
        error(label, 'templateId', `"${templateId}" renders "${template.sceneType}" scenes but this scene is "${sceneType}"`);
      }
    }

    const elements = scene.elements ?? null;
    if (elements === null) {
      warn(label, 'elements', 'elements is null - template will render empty');
    } else if (template) {
      const parsed = template.elements.safeParse(elements);
      if (!parsed.success) {
        for (const issue of parsed.error.issues) {
          error(label, `elements.${issue.path.join('.')}`, issue.message);
        }
      }
    }

    const audioDuration = Number(scene.audio?.duration) || 0;
    const durationSeconds = audioDuration || Number(scene.duration) || 0;
    const narration = String(scene.audio?.text || '').trim();
    const imagePrompt = scene.imagePrompt || '';
    const imageUrl = scene.imageUrl || '';

    if (stage === 'render') {
      if (!(durationSeconds > 0)) error(label, 'timing.durationSeconds', 'duration must be greater than 0');
      if (narration && !(audioDuration > 0)) {
        error(label, 'audio.durationSeconds', 'has narration text but audio duration is 0 - TTS likely produced an empty clip');
      }
      if (imagePrompt && !imageUrl) error(label, 'imageUrl', 'image prompt set but no image was generated');
    } else if (IMAGE_BEARING.has(sceneType) && !imagePrompt && jobConfig.type !== 'podcast') {
      warn(label, 'imagePrompt', `"${sceneType}" scene has no imagePrompt - nothing will be generated for it`);
    }

    return {
      sceneId: scene.sceneId || `scene-${sceneNumber}`,
      sceneNumber,
      sceneType,
      templateId,
      speaker: scene.speaker === 'host' || scene.speaker === 'guest' ? scene.speaker : '',
      title: scene.title || '',
      subtitle: scene.subtitle || '',
      backgroundColor: scene.backgroundColor || '#1a1a2e',
      transition: scene.transition || 'fade',
      cameraMotion: scene.cameraMotion || 'static',
      animation: scene.animation || '',
      imagePrompt,
      imageUrl,
      timing: {
        durationSeconds,
        durationFrames: Math.round(durationSeconds * FPS),
        fps: FPS,
      },
      audio: {
        text: scene.audio?.text || '',
        url: audioUrlFor ? audioUrlFor(sceneNumber) : null,
        durationSeconds: audioDuration,
        voice: scene.audio?.voice || '',
        emotion: scene.audio?.emotion || '',
        captionTimestamps: scene.audio?.captionTimestamps ?? null,
      },
      elements,
    };
  });

  const ir = {
    version: IR_VERSION,
    jobId: String(jobId),
    title: script.title || '',
    description: script.description || '',
    tags: Array.isArray(script.tags) ? script.tags : [],
    thumbnailPrompt: script.thumbnailPrompt || '',
    video: {
      type: jobConfig.type || 'educational',
      language: jobConfig.language || 'english',
      resolution: jobConfig.resolution || '1920x1080',
      aspectRatio: jobConfig.aspectRatio || '16:9',
      fps: FPS,
      quality: jobConfig.quality || 'standard',
      fontPairing: jobConfig.fontPairing || 'default',
      captionAnimation: jobConfig.captionAnimation || 'fadeInUp',
    },
    avatar: jobConfig.avatar?.videoUrl
      ? { videoUrl: jobConfig.avatar.videoUrl, position: jobConfig.avatar.position ?? null }
      : null,
    scenes: irScenes,
  };

  // The per-scene checks above are the readable diagnostics; this is the
  // backstop that guarantees the object handed on really has the shape
  // schema.js promises, whatever the input looked like.
  const parsed = SceneGraph.safeParse(ir);
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      const sceneIdx = issue.path[0] === 'scenes' ? issue.path[1] : null;
      const scene = sceneIdx != null ? irScenes[sceneIdx]?.sceneNumber ?? null : null;
      error(scene, issue.path.join('.'), issue.message);
    }
  }

  const ok = !issues.some((i) => i.severity === 'error');
  return { ir: parsed.success ? parsed.data : ir, issues, ok };
}

/**
 * One-line-per-issue rendering for logs and error messages.
 */
function formatIssues(issues) {
  return issues.map((i) => `${i.severity === 'error' ? 'ERROR' : 'warn '} ${i.scene != null ? `scene ${i.scene} ` : ''}${i.path ? `${i.path}: ` : ''}${i.message}`);
}

module.exports = { compile, formatIssues, FPS };
