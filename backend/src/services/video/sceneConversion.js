const PromptService = require('../common/PromptService');
const LLMService = require('../common/LLMService');
const LoggerService = require('../common/LoggerService');
const ScriptParserService = require('./ScriptParserService');
const StoryboardPlanningService = require('../director/StoryboardPlanningService');
const VisualPlanningService = require('../director/VisualPlanningService');

/**
 * Converts one scene to a different sceneType the way script generation would
 * have built it, instead of just flipping `sceneType` and leaving the template,
 * `elements` and image fields describing the old type. Pure data in, patch out:
 * nothing is persisted (the Studio merges the patch into its unsaved draft).
 */

const IMAGE_BEARING = new Set(['image', 'contentwithimage']);

// Same cross-template fields remap-template carries over: a style or background
// pick shouldn't be lost because the layout changed.
const CARRYOVER_ELEMENT_FIELDS = ['backgroundColor', 'styleConfig'];

const MAX_IMAGE_PROMPT_CHARS = 400;
const MIN_IMAGE_PROMPT_CHARS = 8;
// The editor waits on this call, so a slow or busy local LLM falls back to the
// deterministic prompt instead of leaving the dropdown spinning.
const DRAFT_TIMEOUT_MS = 45000;

const hasText = (v) => typeof v === 'string' && v.trim().length > 0;

const narrationSentences = (scene) =>
  (String(scene.audio?.text || '').match(/[^.!?]+[.!?]+/g) || []).map((s) => s.trim()).filter(Boolean).slice(0, 6);

/** Last-resort prompt built from the scene's own words. */
function fallbackPrompt(scene, styleGuide) {
  const subject = (scene.title || '').trim() || StoryboardPlanningService._leadSentence(scene.audio?.text);
  if (!hasText(subject)) return '';
  const detail = StoryboardPlanningService._leadSentence(scene.audio?.text);
  const base = detail && detail !== subject ? `${subject} - ${detail}` : subject;
  const prompt = `Cinematic illustration representing: ${base}. No text, letters or logos`;
  return VisualPlanningService.styledPrompt(prompt.slice(0, MAX_IMAGE_PROMPT_CHARS), styleGuide);
}

/**
 * An image prompt for a scene that has none. Asks the LLM (told the video's
 * shared look) and falls back to a deterministic prompt if it is down, slow or
 * returns junk. Returns `{ prompt, source }`, source 'llm' | 'fallback' | 'none'.
 */
async function draftImagePrompt(scene, job) {
  const styleGuide = job?.script?.brief?.styleGuide || {};
  const narration = String(scene.audio?.text || '').replace(/\s+/g, ' ').trim();
  if (!hasText(scene.title) && !narration) return { prompt: '', source: 'none' };

  let timer;
  try {
    const rendered = PromptService.render('sceneImagePrompt', {
      videoType: job?.type || 'general',
      topic: job?.topic || '',
      language: job?.language || 'English',
      visualPalette: styleGuide.visualPalette || 'consistent, clean and modern',
      title: scene.title || '',
      narration: narration.slice(0, 600),
    });
    const parsed = await Promise.race([
      LLMService.generateScript(rendered, { maxTokens: 300, timeout: 30000 }),
      new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('image prompt drafting timed out')), DRAFT_TIMEOUT_MS); }),
    ]);
    const prompt = String(parsed?.imagePrompt || '').trim();
    if (prompt.length >= MIN_IMAGE_PROMPT_CHARS) {
      return { prompt: VisualPlanningService.styledPrompt(prompt.slice(0, MAX_IMAGE_PROMPT_CHARS), styleGuide), source: 'llm' };
    }
  } catch (err) {
    LoggerService.warn('Image prompt drafting failed - using the fallback prompt', { error: err.message });
  } finally {
    clearTimeout(timer);
  }
  return { prompt: fallbackPrompt(scene, styleGuide), source: 'fallback' };
}

/**
 * @param {object} scene   the scene as the editor holds it (unsaved edits included)
 * @param {string} toType  one of ScriptParserService.SCENE_TYPE_TEMPLATE_IDS' keys
 * @param {object} job     { type, topic, language, hostName, guestName, script.brief }
 * @returns {Promise<{ patch: object, promptSource: string }>} fields to merge into the scene
 */
async function convertSceneType(scene, toType, job = {}) {
  const templateId = ScriptParserService._getDefaultTemplateForType(toType);
  const isPodcast = toType === 'podcast';
  const wantsImage = IMAGE_BEARING.has(toType);

  // contentwithimage shows a body paragraph, not the sentence list.
  const subtitle = toType === 'contentwithimage'
    ? (scene.subtitle || StoryboardPlanningService._leadSentence(scene.audio?.text))
    : (scene.subtitle || '');

  const elements = ScriptParserService._createDefaultElements(
    templateId,
    { title: scene.title || '', subtitle, speaker: scene.speaker || '', audio: { text: scene.audio?.text || '' } },
    { hostName: job.hostName, guestName: job.guestName },
    toType
  );
  for (const field of CARRYOVER_ELEMENT_FIELDS) {
    if (scene.elements?.[field] !== undefined) elements[field] = scene.elements[field];
  }
  // A content scene shows its narration as rows; keep that rather than one empty row.
  if (toType === 'content') {
    const sentences = narrationSentences(scene);
    if (sentences.length > 0) elements.items = sentences.map((text) => ({ heading: '', text }));
  }

  // Image fields: image-bearing types need a prompt (drafted if the scene has
  // none), podcasts keep whatever cover they had, every other type carries none.
  let imagePrompt = '';
  let imageUrl = '';
  let promptSource = 'none';
  if (wantsImage) {
    imageUrl = scene.imageUrl || '';
    if (hasText(scene.imagePrompt)) {
      imagePrompt = scene.imagePrompt.trim();
      promptSource = 'existing';
    } else {
      ({ prompt: imagePrompt, source: promptSource } = await draftImagePrompt(scene, job));
    }
    elements.image = imageUrl;
  } else if (isPodcast) {
    imagePrompt = scene.imagePrompt || '';
    imageUrl = scene.imageUrl || '';
    elements.hostImage = imageUrl;
  }

  const patch = { sceneType: toType, templateId, subtitle, elements, imagePrompt, imageUrl };

  // Keep the storyboard in step with the scene, as StoryboardPlanningService.apply
  // does. The old layout belonged to the old type, so it is cleared for the system to pick.
  if (scene.storyboard && typeof scene.storyboard === 'object') {
    const visual = wantsImage && hasText(imagePrompt)
      ? { kind: 'image', prompt: imagePrompt, status: imageUrl ? 'generated' : 'pending' }
      : { kind: 'none', prompt: '', status: 'none' };
    patch.storyboard = { ...scene.storyboard, layout: '', visual };
  }

  return { patch, promptSource };
}

module.exports = { convertSceneType, draftImagePrompt, IMAGE_BEARING };
