import { SCENE_IDS } from './scenes';

/**
 * Layout hints - lets the Director's storyboard pick a scene's composition
 * (`scene.storyboard.layout`, or `scene.layout` in render props) instead of
 * solveLayout's content-shape heuristics always deciding.
 *
 * A hint is advisory. Every layout builder assumes a content shape (grid
 * wants a list, comparison-split wants exactly two items, split-image wants an
 * image...), and rendering content into a layout that can't show it silently
 * drops text. So a hint is only honoured when the scene's own content fits;
 * otherwise solveLayout falls back to its heuristic exactly as if no hint had
 * been given. The Director never needs to know the content shape perfectly.
 *
 * The id list below must match backend/src/ir/templateRegistry.js's
 * LAYOUT_IDS - both are pinned by tests against the same literal list.
 */
export const LAYOUT_IDS = SCENE_IDS;

const PODCAST_LAYOUTS = new Set(['podcast-split', 'podcast-centered']);

/** True when `strategy` can show this ContentProfile without losing content. */
export const isLayoutCompatible = (strategy, profile) => {
  if (!SCENE_IDS.includes(strategy)) return false;

  // sceneTypes with a dedicated composition only accept that family.
  if (profile.sceneType === 'podcast') return PODCAST_LAYOUTS.has(strategy);
  if (PODCAST_LAYOUTS.has(strategy)) return false;
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
};

/** The hinted strategy if it is valid and compatible, otherwise null. */
export const resolveLayoutHint = (profile) => {
  const hint = String(profile?.layoutHint || '').trim().toLowerCase();
  return hint && isLayoutCompatible(hint, profile) ? hint : null;
};
