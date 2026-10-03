/**
 * Camera motion - a slow whole-scene zoom/pan applied around a scene's
 * template output. `scene.cameraMotion` is written by the script LLM (and
 * cycled by MotionPlanningService), and picked in the Studio's Animation
 * tab; until this module existed, nothing in the renderer read it.
 *
 * Pure functions of (motion, progress), so the Studio preview, the final
 * render and the thumbnail all agree on the same frame. Every move keeps
 * scale >= 1 so the scene never reveals an empty edge.
 */

// Vocabulary the LLM prompts and the Studio dropdown use, mapped onto the
// four primitive moves below. "slide"/"tracking" have no dedicated render, so
// they read as a pan rather than being ignored.
const MOTION_ALIASES = {
  'zoom-in': 'zoom-in',
  'zoom-out': 'zoom-out',
  'pan-left': 'pan-left',
  'pan-right': 'pan-right',
  slide: 'pan-left',
  pan: 'pan-left',
  tracking: 'pan-right',
};

export const CAMERA_MOTION_IDS = Object.keys(MOTION_ALIASES);

const ZOOM_AMOUNT = 0.06; // 6% total scale change across the scene
const PAN_SCALE = 1.05; // constant over-scale that gives a pan room to travel
const PAN_TRAVEL_PCT = 2; // +/- percent of the canvas width

export const resolveCameraMotion = (motion) => MOTION_ALIASES[String(motion || '').trim().toLowerCase()] || null;

const clamp01 = (n) => Math.min(1, Math.max(0, n));

/**
 * Returns `{ scale, translateXPct }` for a motion at `progress` (0 -> 1
 * across the scene), or null for static/unknown motion.
 */
export const computeCameraTransform = (motion, progress) => {
  const id = resolveCameraMotion(motion);
  if (!id) return null;
  const p = clamp01(progress);

  switch (id) {
    case 'zoom-in':
      return { scale: 1 + ZOOM_AMOUNT * p, translateXPct: 0 };
    case 'zoom-out':
      return { scale: 1 + ZOOM_AMOUNT * (1 - p), translateXPct: 0 };
    case 'pan-left':
      return { scale: PAN_SCALE, translateXPct: PAN_TRAVEL_PCT * (1 - 2 * p) };
    case 'pan-right':
      return { scale: PAN_SCALE, translateXPct: -PAN_TRAVEL_PCT * (1 - 2 * p) };
    default:
      return null;
  }
};

export const cameraTransformToCss = (transform) =>
  transform ? `translateX(${transform.translateXPct}%) scale(${transform.scale})` : undefined;
