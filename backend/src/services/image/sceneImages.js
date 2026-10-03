const config = require('../../config');
const LoggerService = require('../common/LoggerService');
const { abortableDelay } = require('../../utils/abortableDelay');
const ScriptParserService = require('../video/ScriptParserService');
const StoryboardPlanningService = require('../director/StoryboardPlanningService');
const ImageGenerationService = require('./ImageGenerationService');

/**
 * Fills a video's scenes with their generated images - the one place both the
 * standalone video worker and the course render stage call.
 *
 * Contract: after this returns, every scene that has an `imagePrompt` also has
 * an `imageUrl`, or it has been rewritten as a text-only scene (and its
 * imagePrompt cleared). That is exactly what RemotionService.validateAssets
 * demands, so image trouble never fails a job unless IMAGE_GEN_REQUIRED=true.
 */

const isCancel = (err) => err?.name === 'AbortError' || err?.cancelled === true;
const hasText = (v) => typeof v === 'string' && v.trim().length > 0;

/** How many times this scene's picture has been re-rolled (0 = the original). */
const variantOf = (scene) => Number(scene.storyboard?.visual?.variant) || 0;

/** A scene that asked for an image and has none yet. */
const needsImage = (scene) => hasText(scene.imagePrompt) && !hasText(scene.imageUrl);

/** Podcast turns show the host image; every other image-bearing scene shows `image`. */
const imageFieldFor = (scene) => (scene.sceneType === 'podcast' ? 'hostImage' : 'image');

const withStoryboardVisual = (scene, visual) =>
  scene.storyboard && typeof scene.storyboard === 'object'
    ? { ...scene.storyboard, visual: { ...(scene.storyboard.visual || {}), ...visual } }
    : scene.storyboard ?? null;

/** The scene with its generated image applied everywhere a template reads it. */
function applyImage(scene, url) {
  return {
    ...scene,
    imageUrl: url,
    elements: { ...(scene.elements || {}), [imageFieldFor(scene)]: url },
    storyboard: withStoryboardVisual(scene, { kind: 'image', prompt: scene.imagePrompt, status: 'generated' }),
  };
}

const narrationSentences = (scene) =>
  (String(scene.audio?.text || '').match(/[^.!?]+[.!?]+/g) || []).map((s) => s.trim()).filter(Boolean).slice(0, 6);

/**
 * Rewrite a scene whose image could not be made as a text-only scene that still
 * says what it was going to say. Keeps its narration, timing and audio.
 */
function degradeScene(scene, reason) {
  const elements = scene.elements || {};
  const keep = {
    ...(elements.backgroundColor ? { backgroundColor: elements.backgroundColor } : {}),
    ...(elements.styleConfig ? { styleConfig: elements.styleConfig } : {}),
  };
  const visual = { kind: 'none', prompt: '', status: 'degraded', reason };

  let next;
  if (scene.sceneType === 'contentwithimage') {
    const sentences = narrationSentences(scene);
    const items = sentences.length > 0
      ? sentences.map((text) => ({ heading: '', text }))
      : [{ heading: '', text: elements.body || scene.subtitle || '' }];
    next = { ...scene, sceneType: 'content', elements: { ...keep, title: elements.title || scene.title || '', items, caption: '', captionTimestamps: null } };
  } else if (scene.sceneType === 'image') {
    next = {
      ...scene,
      sceneType: 'title',
      elements: { ...keep, title: elements.caption || scene.title || '', subtitle: scene.subtitle || '', image: '' },
    };
  } else {
    // Podcast turns keep their layout (the image slot shows its placeholder).
    next = { ...scene };
  }

  // A different sceneType needs a template of that type when scenes are rendered
  // by the hand-coded templates rather than the generative engine.
  if (next.sceneType !== scene.sceneType && scene.templateId !== ScriptParserService.GENERATIVE_TEMPLATE_ID) {
    next.templateId = ScriptParserService._getDefaultTemplateForType(next.sceneType);
  }

  const layout = next.storyboard?.layout;
  return {
    ...next,
    imagePrompt: '',
    imageUrl: '',
    storyboard: next.storyboard
      ? { ...withStoryboardVisual(next, visual), layout: layout === 'split-image' || layout === 'image-fullbleed' ? '' : layout }
      : null,
  };
}

async function generateWithRetry({ id, prompt, aspectRatio, variant, signal, generator }) {
  const attempts = Math.max(1, config.imageGen.maxRetries);
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      return await generator.generate({ jobId: id, prompt, aspectRatio, variant, signal });
    } catch (err) {
      if (isCancel(err) || err.permanent) throw err;
      lastError = err;
      LoggerService.warn(`Image generation attempt ${attempt}/${attempts} failed`, { jobId: id, error: err.message });
      if (attempt < attempts) await abortableDelay(Math.min(2000 * 2 ** (attempt - 1), 15000), signal);
    }
  }
  throw lastError;
}

/**
 * @param {object}   opts
 * @param {string}   opts.id            video / course-video id (storage + logs)
 * @param {object[]} opts.scenes        plain scene objects
 * @param {string}   opts.aspectRatio   "16:9" | "9:16" | "1:1" | "4:5"
 * @param {AbortSignal} [opts.signal]
 * @param {Function} [opts.checkCancelled]  async, throws when the job was stopped
 * @param {Function} [opts.onProgress]      (done, total) per distinct image
 * @param {Function} [opts.persist]         async (changedScenes) - called as images land, so a
 *                                          crash mid-batch keeps the finished ones
 * @returns {Promise<{ scenes, total, generated, cached, degraded: number[], reasons: string[] }>}
 */
async function ensureSceneImages({
  id, scenes, aspectRatio, signal, checkCancelled, onProgress, persist, generator = ImageGenerationService,
}) {
  const result = [...scenes];
  // One generation per distinct (prompt, variant): scenes sharing both (a podcast's
  // cover) share the picture, while a re-rolled scene gets its own.
  const groups = new Map(); // "prompt\u0000variant" -> scene indices
  result.forEach((scene, index) => {
    if (!needsImage(scene)) return;
    const key = `${scene.imagePrompt.trim()}\u0000${variantOf(scene)}`;
    groups.set(key, [...(groups.get(key) || []), index]);
  });

  const summary = { scenes: result, total: groups.size, generated: 0, cached: 0, degraded: [], reasons: [] };
  if (groups.size === 0) return summary;

  const degrade = async (indices, reason) => {
    indices.forEach((i) => { result[i] = degradeScene(result[i], reason); });
    summary.degraded.push(...indices.map((i) => result[i].sceneNumber));
    if (!summary.reasons.includes(reason)) summary.reasons.push(reason);
    if (persist) await persist(indices.map((i) => result[i]));
  };

  if (!config.imageGen.enabled) {
    if (config.imageGen.required) {
      throw new Error('This video needs generated images but image generation is off (COMFYUI_ENABLED is not true) and IMAGE_GEN_REQUIRED=true');
    }
    await degrade([...groups.values()].flat(), 'Image generation is not enabled');
    LoggerService.info('Image generation disabled - rendering image scenes as text', { jobId: id, scenes: summary.degraded.length });
    return summary;
  }

  let done = 0;
  for (const [key, indices] of groups) {
    if (checkCancelled) await checkCancelled();
    const [prompt] = key.split('\u0000');
    const variant = variantOf(result[indices[0]]);

    try {
      const image = await generateWithRetry({ id, prompt, aspectRatio, variant, signal, generator });
      indices.forEach((i) => { result[i] = applyImage(result[i], image.url); });
      if (image.fromCache) summary.cached += 1; else summary.generated += 1;
      if (persist) await persist(indices.map((i) => result[i]));
    } catch (err) {
      if (isCancel(err)) throw err;
      if (config.imageGen.required) throw err;
      LoggerService.warn('Image generation failed - rendering these scenes as text', { jobId: id, prompt: prompt.slice(0, 80), error: err.message });
      await degrade(indices, err.message);
    }

    done += 1;
    if (onProgress) await onProgress(done, groups.size);
  }

  return summary;
}

/**
 * A scene set up to have its picture (re)generated: the prompt (a new one, or the
 * scene's own), the old image cleared, and the variant bumped so the next
 * generation is a different picture. A text scene given a prompt becomes an
 * image scene. Returns null when there is no prompt to work from.
 */
function prepareSceneForImage(scene, promptOverride = '') {
  const prompt = [promptOverride, scene.imagePrompt, scene.storyboard?.visual?.prompt].find(hasText)?.trim();
  if (!prompt) return null;

  const field = imageFieldFor(scene);
  let next = { ...scene };

  if (scene.sceneType === 'content') {
    // A bulleted text scene has nowhere to show a picture; make it the image-and-text
    // kind, with the narration's first sentence as its body.
    const elements = scene.elements || {};
    next = {
      ...scene,
      sceneType: 'contentwithimage',
      subtitle: scene.subtitle || StoryboardPlanningService._leadSentence(scene.audio?.text),
      elements: {
        ...(elements.backgroundColor ? { backgroundColor: elements.backgroundColor } : {}),
        ...(elements.styleConfig ? { styleConfig: elements.styleConfig } : {}),
        title: elements.title || scene.title || '',
        body: scene.subtitle || StoryboardPlanningService._leadSentence(scene.audio?.text),
        image: '',
        badge: '',
      },
    };
    if (scene.templateId !== ScriptParserService.GENERATIVE_TEMPLATE_ID) {
      next.templateId = ScriptParserService._getDefaultTemplateForType('contentwithimage');
    }
  }

  const previous = next.storyboard?.visual || {};
  const { reason: _dropped, ...visual } = previous;
  return {
    ...next,
    imagePrompt: prompt,
    imageUrl: '',
    elements: { ...(next.elements || {}), [field]: '' },
    storyboard: {
      ...(next.storyboard || {}),
      visual: { ...visual, kind: 'image', prompt, status: 'pending', variant: variantOf(scene) + 1 },
    },
  };
}

module.exports = { ensureSceneImages, needsImage, applyImage, degradeScene, imageFieldFor, prepareSceneForImage, variantOf };
