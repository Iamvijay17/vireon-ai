/**
 * Image motion - how a picture moves inside its own frame.
 *
 * Separate from the camera (camera.js moves the whole scene) and from the
 * entrance animation (motion/, which brings the slot in): this is the slow,
 * continuous drift that keeps a still picture alive for the length of the scene.
 * It is the "image motion" slot of the composable scene system.
 *
 * Every move is a pure function of progress (0 -> 1 across the scene), so the
 * Studio preview, the final render and the thumbnail agree on every frame, and
 * every move keeps scale >= 1 so the frame never reveals an empty edge.
 */

const clamp01 = (n) => Math.min(1, Math.max(0, n));
// Ease in/out so the drift starts and ends gently rather than at constant speed.
const ease = (t) => t * t * (3 - 2 * t);

const ZOOM = 0.08; // 8% total scale change
const PAN_SCALE = 1.08; // over-scale that gives a pan room to travel
const PAN_TRAVEL_PCT = 2.5;
const DRIFT_SCALE = 1.06;
const DRIFT_TRAVEL_PCT = 2.2;

export const IMAGE_MOTION_REGISTRY = {
  none: { id: 'none', compute: () => null },
  slowZoom: {
    id: 'slowZoom',
    compute: (p) => ({ scale: 1 + ZOOM * ease(p), translateXPct: 0, translateYPct: 0 }),
  },
  slowPan: {
    id: 'slowPan',
    compute: (p) => ({ scale: PAN_SCALE, translateXPct: PAN_TRAVEL_PCT * (1 - 2 * ease(p)), translateYPct: 0 }),
  },
  driftUp: {
    id: 'driftUp',
    compute: (p) => ({ scale: DRIFT_SCALE, translateXPct: 0, translateYPct: DRIFT_TRAVEL_PCT * (1 - 2 * ease(p)) }),
  },
};

export const IMAGE_MOTION_IDS = Object.keys(IMAGE_MOTION_REGISTRY);

/**
 * The transform for `id` at `progress`, or null for none/unknown.
 *
 * `damping` (0-1) scales the movement down. It is used when the camera is also
 * moving: two simultaneous drifts compound into more motion than either intends,
 * so the picture's own move is halved rather than left to fight the camera.
 */
export const computeImageTransform = (id, progress, damping = 1) => {
  const motion = IMAGE_MOTION_REGISTRY[id];
  if (!motion || id === 'none') return null;
  const t = motion.compute(clamp01(progress));
  if (!t) return null;
  const d = clamp01(damping);
  return {
    scale: 1 + (t.scale - 1) * d,
    translateXPct: t.translateXPct * d,
    translateYPct: t.translateYPct * d,
  };
};

export const imageTransformToCss = (t) =>
  t ? `translate(${t.translateXPct}%, ${t.translateYPct}%) scale(${t.scale})` : undefined;
