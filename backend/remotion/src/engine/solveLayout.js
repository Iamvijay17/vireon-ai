import { createSeededRng, pick } from './seedRandom';
import { SCENE_REGISTRY, STAT_PATTERN } from './scenes';
import { resolveLayoutHint } from './layoutHint';
import { CANVAS } from './scenes/shared';

/**
 * Layout Solver - layer 2 of the generative scene engine.
 *
 * Computes a flat list of resolved slots `{ id, role, xPct, yPct, wPct,
 * hPct, fontSize, ... }` from a ContentProfile by routing to one of the 12
 * Scene Components in `engine/scenes/` (see its index.js doc comment) -
 * instead of picking one of N pre-authored template files. Geometry is
 * solved against a reference canvas that matches the render's aspect ratio
 * (`options.canvas`, see scenes/shared.js's resolveCanvas; 1920x1080 when
 * omitted), and GeneratedScene.jsx scales that canvas to the actual render
 * size. Vertical positions come from verticalLayout.js (measured blocks +
 * bounded gaps, aligned as one group) - never from fixed row slots.
 *
 * `solveLayout(profile, seed, options)` is a pure function: same inputs
 * always produce the same LayoutPlan, so it's safe to recompute on every
 * render (preview or final) rather than needing to be precomputed and
 * persisted. The plan carries `diagnostics` (content/available height, gap,
 * alignment, overflow) for layout debugging.
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
const runBuilder = (strategy, profile, rng, ctx) => {
  const component = SCENE_REGISTRY[strategy] || SCENE_REGISTRY['stack-list'];
  const result = component.build(profile, rng, ctx);
  return Array.isArray(result) ? { slots: result, waveform: null } : result;
};

export const solveLayout = (profile, seedInput, options = {}) => {
  const canvas = options.canvas || CANVAS;
  const rng = createSeededRng(`${seedInput}-layout`);
  // A storyboard layout hint wins when the scene's content fits it (see
  // layoutHint.js); otherwise the content-shape heuristic decides as before.
  const strategy = resolveLayoutHint(profile) || chooseStrategy(profile, rng);
  const { slots, waveform, diagnostics } = runBuilder(strategy, profile, rng, { canvas });
  return {
    strategy, canvas: { width: canvas.width, height: canvas.height }, slots: slots.filter(Boolean),
    scrim: SCRIM_STRATEGIES.has(strategy), waveform: waveform || null, diagnostics: diagnostics || null,
  };
};
