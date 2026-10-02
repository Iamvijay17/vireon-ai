export const id = 'irisWipe';
export const hardCut = false;

/**
 * Circular reveal expanding from center - `wipe`'s radial counterpart.
 * 75% radius (rather than 100%) is enough to clear all four corners of a
 * 16:9 frame once progress hits 1, since a circle's radius needs to reach
 * the frame's diagonal half-length, not just its half-width.
 */
export const style = (progress) => ({
  opacity: 1,
  clipPath: `circle(${progress * 75}% at 50% 50%)`,
});
