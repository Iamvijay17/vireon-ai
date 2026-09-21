import { createSeededRng, pick } from './seedRandom';
import { SCENE_REGISTRY, STAT_PATTERN } from './scenes';

/**
 * Layout Solver - layer 2 of the generative scene engine.
 *
 * Computes a flat list of resolved slots `{ id, role, xPct, yPct, wPct,
 * hPct, fontSize, ... }` from a ContentProfile by routing to one of the 12
 * Scene Components in `engine/scenes/` (see its index.js doc comment) -
 * instead of picking one of N pre-authored template files. All geometry is
 * solved against a fixed 1920x1080 reference canvas (GeneratedScene.jsx
 * scales the whole content layer against the actual render width, same
 * pattern every hand-coded template already uses).
 *
 * `solveLayout(profile, seed)` is a pure function: same inputs always
 * produce the same LayoutPlan, so it's safe to recompute on every render
 * (preview or final) rather than needing to be precomputed and persisted.
 */
const SCRIM_STRATEGIES = new Set(['image-fullbleed']);

/**
 * Picks a macro composition strategy by rule, not by hand-authored recipe
 * lookup - the seed only breaks ties between multiple equally-valid
 * strategies for the same content shape (e.g. a 5-item short list reads
 * fine as either a grid or a numbered timeline; a podcast turn reads fine
 * as either the split-screen or centered composition), so the same content
 * doesn't always resolve to an identical structure across different videos.
 * sceneType-specific shapes ("image", "podcast") are routed to their own
 * dedicated strategy before the generic content-shape rules apply.
 */
const chooseStrategy = (profile, rng) => {
  if (profile.sceneType === 'image') return 'image-fullbleed';
  if (profile.sceneType === 'podcast') return pick(rng, ['podcast-split', 'podcast-centered']);

  const { itemCount, density, hasImage, hasHeadings, items, body } = profile;
  if (hasImage) return 'split-image';
  // A body paragraph with no items used to fall through to title-only,
  // which never reads `profile.body` - silently dropping the text. Routing
  // a substantial body to quote-feature instead actually uses it.
  if (itemCount === 0) return body && body.length >= 60 ? 'quote-feature' : 'title-only';
  // paragraph-stack, stack-list, grid, timeline and comparison-split (at
  // itemCount===2 only) all build against `profile.itemCount` generically,
  // so any of them renders a given item list correctly - the seed picks
  // among the visually-valid set instead of one fixed strategy always
  // winning for a given content shape.
  if (density === 'paragraph' && itemCount <= 3) return pick(rng, ['paragraph-stack', 'stack-list']);
  if (itemCount === 1 && STAT_PATTERN.test((items[0]?.text || '').trim())) return 'stat-highlight';
  if (itemCount === 2) return pick(rng, ['comparison-split', 'grid', 'stack-list']);
  if (itemCount >= 4 && density !== 'paragraph') return pick(rng, ['grid', 'timeline', 'stack-list']);
  return hasHeadings ? 'timeline' : 'stack-list';
};

// Scene Components return either a plain slot array (most) or
// `{ slots, waveform }` when they also place the decorative podcast
// waveform (see GeneratedScene.jsx's Waveform primitive) - normalized here
// so solveLayout always returns a consistent LayoutPlan shape either way.
const runBuilder = (strategy, profile, rng) => {
  const component = SCENE_REGISTRY[strategy] || SCENE_REGISTRY['stack-list'];
  const result = component.build(profile, rng);
  return Array.isArray(result) ? { slots: result, waveform: null } : result;
};

export const solveLayout = (profile, seedInput) => {
  const rng = createSeededRng(`${seedInput}-layout`);
  const strategy = chooseStrategy(profile, rng);
  const { slots, waveform } = runBuilder(strategy, profile, rng);
  return { strategy, canvas: { width: 1920, height: 1080 }, slots: slots.filter(Boolean), scrim: SCRIM_STRATEGIES.has(strategy), waveform: waveform || null };
};
