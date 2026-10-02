import * as fadeIn from './fadeIn';
import * as fadeSlideUp from './fadeSlideUp';
import * as fadeSlideLeft from './fadeSlideLeft';
import * as scaleIn from './scaleIn';
import * as bounceIn from './bounceIn';
import * as popIn from './popIn';
import * as blurIn from './blurIn';
import * as rotateIn from './rotateIn';
import * as maskWipe from './maskWipe';
import * as typewriterReveal from './typewriterReveal';

/**
 * The 10 Animation Components of the Vireon Motion Design System's
 * per-frame evaluator - the generative engine's counterpart to the
 * hook-based effects in animations/*.js (which stay as-is for the legacy
 * hand-authored templates). Each module exports `{ id, compute(frame, spec) }`
 * as a plain function rather than a hook, since choreograph.js assigns one
 * of these per layout slot and they must be callable a variable number of
 * times per render (see the original motion.js's doc comment for why hooks
 * don't work here).
 */
export const MOTION_REGISTRY = {
  [fadeIn.id]: fadeIn,
  [fadeSlideUp.id]: fadeSlideUp,
  [fadeSlideLeft.id]: fadeSlideLeft,
  [scaleIn.id]: scaleIn,
  [bounceIn.id]: bounceIn,
  [popIn.id]: popIn,
  [blurIn.id]: blurIn,
  [rotateIn.id]: rotateIn,
  [maskWipe.id]: maskWipe,
  [typewriterReveal.id]: typewriterReveal,
};

export const MOTION_IDS = Object.keys(MOTION_REGISTRY);

/**
 * Pure per-frame motion evaluator - same call shape as the original
 * engine/motion.js so every existing call site (GeneratedScene.jsx) keeps
 * working unchanged. `spec` is `{ type, delay, duration, ... }` as assigned
 * by choreograph.js.
 */
export const computeMotionStyle = (frame, spec) => {
  if (!spec) return {};
  const { type = 'fadeIn' } = spec;
  const animation = MOTION_REGISTRY[type] || MOTION_REGISTRY.fadeIn;
  return animation.compute(frame, spec);
};
