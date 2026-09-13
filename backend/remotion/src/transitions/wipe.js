export const id = 'wipe';
export const hardCut = false;

/** Reveals left-to-right via a growing clip window instead of fading. */
export const style = (progress) => ({
  opacity: 1,
  clipPath: `inset(0 ${(1 - progress) * 100}% 0 0)`,
});
