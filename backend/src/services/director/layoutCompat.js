const { WORDS_PER_MINUTE } = require('./scriptBudget');
const { PODCAST_LAYOUTS } = require('./vocabulary');
const { LAYOUT_REGISTRY } = require('../../ir/compositionRegistry');

/**
 * What a scene's content looks like to the layout engine, and which layouts can
 * show it without dropping text.
 *
 * The engine only honours a layout hint when the scene's own content fits it
 * (remotion/src/engine/layoutHint.js) and silently falls back to its heuristic
 * otherwise - so the Director must know the same rule, or it would plan a
 * variety the renderer then ignores. `isLayoutCompatible` is a port of that
 * function; tests/director/layoutCompat.test.js pins it case by case against the
 * engine's own table (remotion/src/engine/__tests__/composition.test.js holds the
 * mirror), so the two cannot drift unnoticed.
 */

const IMAGE_BEARING_TYPES = new Set(['image', 'contentwithimage']);

const wordCount = (text) => (String(text || '').trim().match(/\S+/g) || []).length;

/** Estimated spoken length in seconds, from the same pacing the script budget uses. */
const estimateSeconds = (text) => Math.max(0, (wordCount(text) / WORDS_PER_MINUTE) * 60);

const itemsOf = (scene) => {
  const fromElements = scene?.elements?.items;
  if (Array.isArray(fromElements) && fromElements.length) return fromElements.map((i) => ({ heading: i?.heading || '', text: String(i?.text ?? i ?? '') }));
  const content = scene?.scene_meta?.content;
  if (Array.isArray(content)) return content.map((c) => ({ heading: '', text: String(c?.text ?? c ?? '') })).filter((i) => i.text);
  return [];
};

/**
 * The engine's ContentProfile (remotion/src/engine/analyzeContent.js), computed
 * from a scene at Director time - before ScriptParserService has built `elements`,
 * so the raw `scene_meta.content` list stands in for the items. `hasImage` is the
 * planned picture, not an existing URL.
 */
function profileOf(scene, { hasImage = false } = {}) {
  const sceneType = scene?.sceneType || 'content';
  const imageScene = hasImage || IMAGE_BEARING_TYPES.has(sceneType);

  // A picture scene shows a body paragraph beside the image, not a list.
  const items = imageScene || sceneType === 'title' || sceneType === 'podcast' ? [] : itemsOf(scene);
  // The paragraph beside the picture is the scene's content points run together (see ScriptParserService), else its subtitle.
  const body = imageScene ? (scene?.elements?.body || itemsOf(scene).map((i) => i.text).join(' ') || scene?.subtitle || '') : '';

  const totalChars = items.reduce((sum, i) => sum + i.text.length + i.heading.length, 0);
  const avgItemChars = items.length ? totalChars / items.length : 0;
  return {
    sceneType: imageScene && sceneType === 'content' ? 'contentwithimage' : sceneType,
    title: scene?.title || '',
    body,
    items,
    itemCount: items.length,
    avgItemChars,
    // Same buckets as the engine: how much text each item carries.
    density: avgItemChars > 140 ? 'paragraph' : avgItemChars > 60 ? 'medium' : 'short',
    hasHeadings: items.some((i) => Boolean(i.heading)),
    hasImage: imageScene,
  };
}

/** Port of remotion/src/engine/layoutHint.js `isLayoutCompatible`. */
function isLayoutCompatible(strategy, profile) {
  if (!LAYOUT_REGISTRY.includes(strategy)) return false;

  if (profile.sceneType === 'podcast') return PODCAST_LAYOUTS.includes(strategy);
  if (PODCAST_LAYOUTS.includes(strategy)) return false;
  if (profile.sceneType === 'image') return strategy === 'image-fullbleed';

  const { itemCount, hasImage, body } = profile;
  const hasList = itemCount > 0;

  switch (strategy) {
    case 'title-only':
      return !hasList && !body && !hasImage;
    case 'quote-feature':
      return !hasList && !hasImage && Boolean(body || profile.title);
    case 'split-image':
    case 'image-fullbleed':
      return hasImage;
    case 'stack-list':
    case 'paragraph-stack':
      return hasList && !hasImage;
    case 'grid':
    case 'timeline':
      return itemCount >= 2 && !hasImage;
    case 'comparison-split':
      return itemCount === 2 && !hasImage;
    case 'stat-highlight':
      return itemCount === 1 && !hasImage;
    default:
      return false;
  }
}

// Same figure pattern the stat-highlight layout reads (remotion/src/engine/scenes/statHighlight.js).
const STAT_PATTERN = /^[$]?\d[\d,.]*\s*[%xX]?/;
const SEQUENCE_CUE = /\b(first|second|third|then|next|after that|finally|step|steps|stage|phase|process|timeline|history|began|years?|decade|century|before|afterwards)\b/i;
const COMPARISON_CUE = /\b(vs\.?|versus|compared?( to| with)?|whereas|unlike|difference|differences|on the other hand|both)\b/i;

/**
 * Whether a layout MEANS something for this content, beyond merely fitting it.
 * A timeline fits any list of two or more, but only reads as a timeline when the
 * points are ordered; a comparison fits any pair, but only says "versus" when the
 * narration contrasts them. The Director's own picks are exempt (it may know
 * better); these gate what it picks by itself, so variety never costs meaning.
 */
function semanticCues(scene, profile) {
  const narration = `${scene?.audio?.text || ''} ${scene?.title || ''}`;
  return {
    sequential: SEQUENCE_CUE.test(narration) || profile.items.some((i) => /^\s*(\d+[.)]|step\s*\d+)/i.test(i.text)),
    comparison: COMPARISON_CUE.test(narration),
    stat: profile.itemCount === 1 && STAT_PATTERN.test(profile.items[0].text.trim()),
  };
}

module.exports = { profileOf, isLayoutCompatible, semanticCues, estimateSeconds, wordCount, STAT_PATTERN };
