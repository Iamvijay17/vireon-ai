import { spring } from 'remotion';

export const id = 'popIn';

/**
 * Sharper, less overshoot-y spring pop, ported from animations/bounce.js's
 * `usePop` hook - distinct stiffness/damping from bounceIn so choreograph.js
 * has two visually different spring-based options, not two names for the
 * same curve.
 */
export const compute = (frame, spec) => {
  const { delay = 0, fps = 30 } = spec || {};
  const relativeFrame = frame - delay;
  if (relativeFrame < 0) return { opacity: 0, transform: 'scale(0)' };

  const springValue = spring({
    frame: relativeFrame, fps,
    config: { damping: 10, mass: 0.3, stiffness: 200 },
  });

  return {
    opacity: Math.min(springValue * 1.5, 1),
    transform: `scale(${springValue})`,
  };
};
