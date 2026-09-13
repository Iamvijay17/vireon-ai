import * as fade from './fade';
import * as cut from './cut';
import * as slide from './slide';
import * as slideUp from './slideUp';
import * as wipe from './wipe';
import * as irisWipe from './irisWipe';
import * as zoomTransition from './zoomTransition';
import { createSeededRng, pick } from '../engine/seedRandom';

/**
 * The 8 Transitions of the Vireon Motion Design System, extracted from what
 * was previously one inline switch in VideoComposition.jsx's SceneTransition.
 * Each module exports `{ id, hardCut, style(progress) }` - `style` is a pure
 * function of the 0->1 entrance progress VideoComposition already computes
 * (useEntranceProgress), and `hardCut` transitions get zero frame overlap at
 * the scene boundary instead of a hidden crossfade (see boundaryOverlap in
 * VideoComposition.jsx).
 *
 * `dissolve` and `none` are pre-existing aliases (scene JSON already uses
 * both interchangeably with `fade`/`cut`) - kept here rather than migrating
 * every scene's stored `transition` field.
 */
export const TRANSITION_REGISTRY = {
  [fade.id]: fade,
  dissolve: fade,
  [cut.id]: cut,
  none: cut,
  [slide.id]: slide,
  [slideUp.id]: slideUp,
  [wipe.id]: wipe,
  [irisWipe.id]: irisWipe,
  [zoomTransition.id]: zoomTransition,
};

export const TRANSITION_IDS = ['fade', 'dissolve', 'cut', 'none', 'slide', 'slideUp', 'wipe', 'irisWipe', 'zoom'];

export const isHardCut = (transitionId) => Boolean(TRANSITION_REGISTRY[transitionId]?.hardCut);

export const getTransitionStyle = (transitionId, progress) => {
  const transition = TRANSITION_REGISTRY[transitionId] || fade;
  return transition.style(progress);
};

// Soft-transition pool for the deterministic engine default (Phase 3) - the
// two hard-cut aliases (cut/none) are deliberately excluded so a scene that
// never asked for a transition never silently loses its crossfade overlap;
// a hard cut only happens when a scene explicitly requests one.
const AUTO_TRANSITION_POOL = ['fade', 'slide', 'slideUp', 'wipe', 'irisWipe', 'zoom'];

/**
 * Deterministically picks a transition for a scene that didn't request one,
 * the same way choreograph.js picks motion per slot - keyed off the scene's
 * stable identity (sceneId, falling back to templateId+index) so the same
 * scene always resolves to the same transition across preview and final
 * render, while different scenes in the same video still vary.
 */
export const chooseTransition = (scene, index) => {
  const seed = `${scene?.sceneId || scene?.templateId || 'scene'}-${scene?.sceneNumber ?? index ?? 0}-transition`;
  const rng = createSeededRng(seed);
  return pick(rng, AUTO_TRANSITION_POOL);
};

/**
 * Resolves the transition id to actually use for a scene, in priority order:
 * explicit valid id (as stored on the scene JSON, aliases included) -> a
 * deterministic engine-chosen default. Never returns an id absent from
 * TRANSITION_REGISTRY, so callers never need their own unknown/empty-string
 * fallback.
 */
export const resolveTransitionId = (scene, index) => {
  const explicit = scene?.transition;
  if (explicit && TRANSITION_REGISTRY[explicit]) return explicit;
  return chooseTransition(scene, index);
};
