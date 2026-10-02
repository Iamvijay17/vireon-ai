import { spring } from 'remotion';

export const id = 'bounceIn';

/**
 * Spring-driven overshoot scale, ported from animations/bounce.js's
 * `useBounce` hook (same damping/mass/stiffness) - reimplemented as a plain
 * function of frame instead of a hook so choreograph.js can assign it to
 * any slot without every slot needing its own hook call.
 */
export const compute = (frame, spec) => {
  const { delay = 0, scale = 1.2, fps = 30 } = spec || {};
  const relativeFrame = frame - delay;
  if (relativeFrame < 0) return { opacity: 0, transform: 'scale(0)' };

  const springValue = spring({
    frame: relativeFrame, fps,
    config: { damping: 8, mass: 0.5, stiffness: 150 },
  });
  const currentScale = 1 + (scale - 1) * springValue * (1 + 0.3 * (1 - springValue));

  return {
    opacity: Math.min(springValue * 1.5, 1),
    transform: `scale(${currentScale})`,
  };
};
