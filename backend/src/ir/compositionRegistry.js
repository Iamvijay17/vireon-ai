const { LAYOUT_IDS } = require('./templateRegistry');

/**
 * Backend-side mirror of the ids Remotion's composable scene system can draw.
 * Same arrangement as templateRegistry.js: backend/src is CommonJS and cannot
 * import the ESM Remotion package, so the ids are repeated here and pinned by
 * tests against literal lists (tests/ir/compositionRegistry.test.js here,
 * remotion/src/engine/__tests__/composition.test.js there). Change one side and
 * the other side's test fails.
 *
 * A scene is composed from independent slots instead of one monolithic template:
 *
 *   Scene
 *   ├── layout       where things go                    LAYOUT_REGISTRY
 *   ├── background   the environment behind the content BACKGROUND_REGISTRY
 *   ├── decoration   vector accents around the content  DECORATION_REGISTRY
 *   ├── textMotion   how text enters                    TEXT_MOTION_REGISTRY
 *   ├── imageMotion  how a picture moves in its frame   IMAGE_MOTION_REGISTRY
 *   ├── camera       slow whole-scene move              CAMERA_REGISTRY
 *   └── transition   how the scene ends                 TRANSITION_REGISTRY
 *
 * The user-facing names in the design brief map onto these ids:
 *   gradientMesh → meshGradient · floatingParticles → particles / floatingShapes
 *   subtlePushIn → camera zoom-in · slowZoom → imageMotion slowZoom
 */

const LAYOUT_REGISTRY = Object.freeze([...LAYOUT_IDS]);

const BACKGROUND_REGISTRY = Object.freeze([
  'solid', 'gradient', 'meshGradient', 'grid', 'particles', 'glow', 'blobs', 'aurora',
]);

const DECORATION_REGISTRY = Object.freeze([
  'floatingShapes', 'connectingLines', 'dots', 'waves', 'geometric', 'orbit', 'arrows',
]);

const TEXT_MOTION_REGISTRY = Object.freeze([
  'fadeIn', 'fadeSlideUp', 'fadeSlideLeft', 'scaleIn', 'bounceIn', 'popIn', 'blurIn', 'rotateIn', 'maskWipe', 'typewriterReveal',
]);

// New with the composable motion engine - a picture's own movement inside its
// frame, separate from the camera move applied to the whole scene.
const IMAGE_MOTION_REGISTRY = Object.freeze(['none', 'slowZoom', 'slowPan', 'driftUp']);

const CAMERA_REGISTRY = Object.freeze(['static', 'zoom-in', 'zoom-out', 'pan-left', 'pan-right']);

const TRANSITION_REGISTRY = Object.freeze([
  'fade', 'dissolve', 'cut', 'none', 'slide', 'slideUp', 'wipe', 'irisWipe', 'zoom',
]);

/** Slot name → the registry its value must come from. */
const COMPOSITION_SLOTS = Object.freeze({
  layout: LAYOUT_REGISTRY,
  background: BACKGROUND_REGISTRY,
  decoration: DECORATION_REGISTRY,
  textMotion: TEXT_MOTION_REGISTRY,
  imageMotion: IMAGE_MOTION_REGISTRY,
  camera: CAMERA_REGISTRY,
  transition: TRANSITION_REGISTRY,
});

/**
 * Keep only the slots whose value the renderer actually has. An unknown value is
 * dropped (the engine's own deterministic choice applies) rather than passed on -
 * a stored composition can therefore never name something Remotion would have to
 * guess about.
 */
function sanitizeComposition(input) {
  const out = {};
  if (!input || typeof input !== 'object') return out;
  for (const [slot, registry] of Object.entries(COMPOSITION_SLOTS)) {
    if (typeof input[slot] === 'string' && registry.includes(input[slot])) out[slot] = input[slot];
  }
  return out;
}

module.exports = {
  LAYOUT_REGISTRY,
  BACKGROUND_REGISTRY,
  DECORATION_REGISTRY,
  TEXT_MOTION_REGISTRY,
  IMAGE_MOTION_REGISTRY,
  CAMERA_REGISTRY,
  TRANSITION_REGISTRY,
  COMPOSITION_SLOTS,
  sanitizeComposition,
};
