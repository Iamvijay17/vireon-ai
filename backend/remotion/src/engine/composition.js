import { SCENE_IDS } from './scenes';
import { BACKGROUND_IDS } from './backgrounds';
import { DECORATION_IDS } from './decorations';
import { MOTION_IDS } from './motion';
import { IMAGE_MOTION_IDS } from './imageMotion';
import { TRANSITION_IDS } from '../transitions';
import { resolveCameraMotion } from '../camera';

/**
 * The composable scene: a scene is assembled from independent slots instead of
 * being one monolithic template.
 *
 *   Scene
 *   ├── layout       where things go              scene.layout / storyboard.layout
 *   ├── background   the environment behind       scene.composition.background
 *   ├── decoration   vector accents               scene.composition.decoration
 *   ├── textMotion   how text enters              scene.composition.textMotion
 *   ├── imageMotion  how a picture drifts         scene.composition.imageMotion
 *   ├── camera       slow whole-scene move        scene.cameraMotion
 *   └── transition   how the scene ends           scene.transition
 *
 * Layout, camera and transition already had their own fields and registries;
 * `scene.composition` adds the other four. Every slot is optional: an unset slot
 * keeps the engine's deterministic choice, so a scene without a composition (all
 * existing ones) renders exactly as it always did. A value the registry does not
 * know is ignored rather than guessed at.
 *
 * Applies to the generative engine (templateId "generative"). The hand-authored
 * numbered templates have their own fixed look and ignore it.
 *
 * The backend mirrors these ids in backend/src/ir/compositionRegistry.js; the two
 * lists are pinned by tests on both sides.
 */
export const COMPOSITION_SLOTS = {
  layout: SCENE_IDS,
  background: BACKGROUND_IDS,
  decoration: DECORATION_IDS,
  textMotion: MOTION_IDS,
  imageMotion: IMAGE_MOTION_IDS,
  camera: ['static', 'zoom-in', 'zoom-out', 'pan-left', 'pan-right'],
  transition: TRANSITION_IDS,
};

const OVERRIDABLE = ['background', 'decoration', 'textMotion', 'imageMotion'];

/** The scene's valid composition overrides, as { background?, decoration?, textMotion?, imageMotion? }. */
export const resolveComposition = (scene) => {
  const raw = scene?.composition;
  if (!raw || typeof raw !== 'object') return {};
  const out = {};
  for (const slot of OVERRIDABLE) {
    const value = raw[slot];
    if (typeof value === 'string' && COMPOSITION_SLOTS[slot].includes(value)) out[slot] = value;
  }
  return out;
};

// Roles that carry text; the image slot has its own motion.
const TEXT_ROLES = new Set(['title', 'listItem', 'body', 'label']);

/**
 * A copy of the choreographed motion plan with every text slot entering by
 * `textMotion`. Timing (delay, duration, stagger) is untouched, so the reading
 * order and pacing the choreographer built still hold - only the style of entrance
 * changes. No textMotion returns the plan as it was.
 */
export const applyTextMotion = (motionPlan, slots, textMotion) => {
  if (!textMotion || !COMPOSITION_SLOTS.textMotion.includes(textMotion)) return motionPlan;
  const next = { ...motionPlan };
  for (const slot of slots) {
    if (TEXT_ROLES.has(slot.role) && next[slot.id]) next[slot.id] = { ...next[slot.id], type: textMotion };
  }
  return next;
};

/**
 * How much of an image's own movement to keep. When the camera is moving too, the
 * two compound, so the picture's drift is halved.
 */
export const imageMotionDamping = (cameraMotion) => (resolveCameraMotion(cameraMotion) ? 0.5 : 1);
