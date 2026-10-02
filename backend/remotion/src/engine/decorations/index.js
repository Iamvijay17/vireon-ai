import * as floatingShapes from './floatingShapes';
import * as connectingLines from './connectingLines';
import * as dots from './dots';
import * as waves from './waves';
import * as geometric from './geometric';
import * as orbit from './orbit';
import * as arrows from './arrows';

/**
 * The 7 Decoration Components of the generative scene engine - animated
 * vector/geometric accents around or behind the content (distinct from the
 * Background Registry's full-bleed environment and the Motion Registry's
 * content-element animation). Same `{ id, render(props) }` plain-function
 * shape as the Background Registry; `props` is
 * `{ frame, palette, intensity, seed }`.
 */
export const DECORATION_REGISTRY = {
  [floatingShapes.id]: floatingShapes,
  [connectingLines.id]: connectingLines,
  [dots.id]: dots,
  [waves.id]: waves,
  [geometric.id]: geometric,
  [orbit.id]: orbit,
  [arrows.id]: arrows,
};

export const DECORATION_IDS = Object.keys(DECORATION_REGISTRY);

/**
 * Resolves and renders a decoration by id, falling back to `dots` (the
 * cheapest, least visually intrusive option) for an unknown/missing id -
 * same never-throw fallback contract as renderBackground/computeMotionStyle.
 */
export const renderDecoration = (idValue, props) => {
  const decoration = DECORATION_REGISTRY[idValue] || DECORATION_REGISTRY.dots;
  return decoration.render(props);
};
