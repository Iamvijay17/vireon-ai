import * as solid from './solid';
import * as gradient from './gradient';
import * as meshGradient from './meshGradient';
import * as grid from './grid';
import * as particles from './particles';
import * as glow from './glow';
import * as blobs from './blobs';
import * as aurora from './aurora';

/**
 * The 8 Background Components of the generative scene engine - the
 * animated environment layer behind a scene's content, distinct from the
 * Decoration Registry (foreground/mid-ground vector accents) and the
 * Motion Registry (content-element animation). Each module exports
 * `{ id, render(props) }` as a plain function returning a React element -
 * the same "plain function, not a hook/stateful component" shape as the
 * Motion Registry's `{ id, compute(frame, spec) }`, just returning JSX
 * instead of a style object since a background actually has to paint
 * pixels. `props` is `{ frame, palette, intensity, seed }`.
 */
export const BACKGROUND_REGISTRY = {
  [solid.id]: solid,
  [gradient.id]: gradient,
  [meshGradient.id]: meshGradient,
  [grid.id]: grid,
  [particles.id]: particles,
  [glow.id]: glow,
  [blobs.id]: blobs,
  [aurora.id]: aurora,
};

export const BACKGROUND_IDS = Object.keys(BACKGROUND_REGISTRY);

/**
 * Resolves and renders a background by id, falling back to `solid` (the
 * cheapest, always-safe option) for an unknown/missing id - same
 * never-throw fallback contract as computeMotionStyle/getTransitionStyle.
 */
export const renderBackground = (idValue, props) => {
  const background = BACKGROUND_REGISTRY[idValue] || BACKGROUND_REGISTRY.solid;
  return background.render(props);
};
