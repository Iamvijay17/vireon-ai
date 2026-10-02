export const id = 'slideUp';
export const hardCut = false;

/** Vertical counterpart to `slide` - rises in from the bottom edge. */
export const style = (progress) => ({
  opacity: 1,
  transform: `translateY(${(1 - progress) * 100}%)`,
});
