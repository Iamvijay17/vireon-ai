import { spring } from 'remotion';

export const id = 'bounceIn';

/**
 * Spring-driven overshoot scale, ported from animations/bounce.js's
 * `useBounce` hook (same damping/mass/stiffness) - reimplemented as a plain
 * function of frame instead of a hook so choreograph.js can assign it to
 * any slot without every slot needing its own hook call.
 *
 * The bounce is the spring's own overshoot: scale runs 0 -> a little past 1 ->
 * settles at exactly 1. (The hook it was ported from multiplies by a peak scale
 * that never relaxes, so it comes to rest at 1.2 - fine for a one-off pop in a
 * hand-built template, wrong here: the layout engine sized every slot for scale
 * 1, and a title resting at 120% runs 10% past each side of its box - off the
 * frame for a full-width title.)
 */
export const compute = (frame, spec) => {
  const { delay = 0, fps = 30 } = spec || {};
  const relativeFrame = frame - delay;
  if (relativeFrame < 0) return { opacity: 0, transform: 'scale(0)' };

  const springValue = spring({
    frame: relativeFrame, fps,
    config: { damping: 8, mass: 0.5, stiffness: 150 },
  });

  return {
    opacity: Math.min(springValue * 1.5, 1),
    transform: `scale(${springValue})`,
  };
};
