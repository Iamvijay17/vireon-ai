export const id = 'slide';
export const hardCut = false;

/** Slides in from the right over a static, fully-opaque background. */
export const style = (progress) => ({
  opacity: 1,
  transform: `translateX(${(1 - progress) * 100}%)`,
});
