import { createSeededRng, pick } from './seedRandom';
import { BACKGROUND_IDS } from './backgrounds';
import { DECORATION_IDS } from './decorations';

/**
 * Visual Selection - the layer between a resolved LayoutPlan/VisualStyle and
 * the Background/Decoration Registries. Maps `solveLayout`'s macro strategy
 * to a background/decoration "mood" (title/content/technical/quote/stat/
 * image/podcast), intersects that with the VisualStyle's own preferred ids,
 * and picks deterministically via the same seeded-rng convention every
 * other engine layer uses (`${seed}-background` / `${seed}-decoration`).
 *
 * Content-awareness (Phase 8): decorations must never compete with the
 * content itself, so their intensity is scaled down by how much of the
 * canvas the scene's own slots already cover (see estimateContentCoverage) -
 * a paragraph-heavy scene gets much fainter/no decoration than a
 * title-only scene, without needing per-element collision detection.
 */

const STRATEGY_TAG = {
  'title-only': 'title',
  'quote-feature': 'quote',
  'stat-highlight': 'stat',
  'timeline': 'technical',
  'comparison-split': 'technical',
  'split-image': 'image',
  'image-fullbleed': 'image',
  'podcast-split': 'podcast',
  'podcast-centered': 'podcast',
};

const tagForStrategy = (strategy) => STRATEGY_TAG[strategy] || 'content';

const TAG_BACKGROUND_POOL = {
  title: ['gradient', 'glow', 'aurora'],
  content: ['gradient', 'grid', 'blobs'],
  technical: ['grid', 'glow'],
  quote: ['gradient'],
  stat: ['glow', 'meshGradient'],
  image: ['gradient', 'glow'],
  podcast: ['gradient', 'glow'],
};

const TAG_DECORATION_POOL = {
  title: ['dots', 'geometric'],
  content: ['dots', 'geometric', 'floatingShapes'],
  technical: ['connectingLines', 'geometric'],
  quote: ['geometric'],
  stat: ['orbit', 'dots'],
  image: ['dots'],
  podcast: ['dots'],
};

// Image/quote/title scenes already have a strong focal element (the image,
// the quote, the headline) - decoration should stay minimal there even
// within an otherwise "busy" VisualStyle, so this multiplies the style's
// base decoration intensity per scene mood on top of the coverage scaling.
const TAG_DECORATION_MULTIPLIER = {
  title: 0.6,
  content: 1,
  technical: 1,
  quote: 0.5,
  stat: 0.9,
  image: 0.35,
  podcast: 0.7,
};

// Fraction (0-1) of the canvas the scene's own non-image slots already
// cover, from LayoutPlan.slots' `wPct`/`hPct` (already 0-1 fractions - see
// scenes/shared.js's titleSlot). A rough sum rather than true union area is
// enough here: it only needs to bias intensity down as content gets denser,
// not model exact overlap.
const estimateContentCoverage = (slots = []) => {
  const area = slots.reduce((sum, slot) => {
    if (!slot || slot.role === 'image') return sum;
    return sum + (slot.wPct || 0) * (slot.hPct || 0);
  }, 0);
  return Math.max(0, Math.min(1, area));
};

const resolvePool = (preferredIds, availableIds) => {
  const filtered = (preferredIds || []).filter((candidateId) => availableIds.includes(candidateId));
  return filtered.length ? filtered : availableIds;
};

/**
 * Picks a background id + intensity for a scene. Pure function of
 * `(layoutPlan, style, seed)` - same inputs always produce the same result.
 */
export const chooseBackground = ({ layoutPlan, style, seed } = {}) => {
  const rng = createSeededRng(`${seed}-background`);
  const tag = tagForStrategy(layoutPlan?.strategy);
  const stylePool = style?.background?.preferred;
  const tagPool = TAG_BACKGROUND_POOL[tag] || stylePool;
  const intersected = (tagPool || []).filter((bgId) => (stylePool || BACKGROUND_IDS).includes(bgId));
  const finalPool = resolvePool(intersected.length ? intersected : tagPool, BACKGROUND_IDS);
  const id = pick(rng, finalPool);

  const coverage = estimateContentCoverage(layoutPlan?.slots);
  const baseIntensity = style?.background?.intensity ?? 0.3;
  const intensity = Math.max(0.08, baseIntensity * (1 - coverage * 0.35));

  return { id, intensity };
};

/**
 * Picks a decoration id + intensity for a scene. Pure function of
 * `(layoutPlan, style, seed)` - same inputs always produce the same result.
 */
export const chooseDecoration = ({ layoutPlan, style, seed } = {}) => {
  const rng = createSeededRng(`${seed}-decoration`);
  const tag = tagForStrategy(layoutPlan?.strategy);
  const stylePool = style?.decoration?.preferred;
  const tagPool = TAG_DECORATION_POOL[tag] || stylePool;
  const intersected = (tagPool || []).filter((decId) => (stylePool || DECORATION_IDS).includes(decId));
  const finalPool = resolvePool(intersected.length ? intersected : tagPool, DECORATION_IDS);
  const id = pick(rng, finalPool);

  const coverage = estimateContentCoverage(layoutPlan?.slots);
  const baseIntensity = style?.decoration?.intensity ?? 0.25;
  const multiplier = TAG_DECORATION_MULTIPLIER[tag] ?? 1;
  const intensity = Math.max(0.04, baseIntensity * multiplier * (1 - coverage * 0.6));

  return { id, intensity };
};
