import { interpolate } from 'remotion';

/**
 * Pure per-frame motion evaluator (not a hook - deliberately, so it can be
 * called a variable number of times per render, once per slot, inside a
 * `.map()`; the animations/*.js hook wrappers can't be used that way since
 * hooks must be called an identical number of times on every render).
 * Reuses the exact same `interpolate()` math those hooks wrap, just called
 * directly - mirrors how existing templates already animate list rows
 * (see templates/001-content/index.jsx's per-row interpolate calls).
 */
export const computeMotionStyle = (frame, spec) => {
  if (!spec) return {};
  const { type = 'fadeIn', delay = 0, duration = 20 } = spec;
  const clamp = { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' };
  const opacity = interpolate(frame, [delay, delay + duration], [0, 1], clamp);

  switch (type) {
    case 'fadeSlideUp': {
      const y = interpolate(frame, [delay, delay + duration], [24, 0], clamp);
      return { opacity, transform: `translateY(${y}px)` };
    }
    case 'fadeSlideLeft': {
      const x = interpolate(frame, [delay, delay + duration], [-24, 0], clamp);
      return { opacity, transform: `translateX(${x}px)` };
    }
    case 'scaleIn': {
      const s = interpolate(frame, [delay, delay + duration], [0.92, 1], clamp);
      return { opacity, transform: `scale(${s})` };
    }
    case 'fadeIn':
    default:
      return { opacity };
  }
};
