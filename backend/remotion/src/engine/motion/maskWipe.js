export const id = 'maskWipe';

/** Ported from animations/maskReveal.js's `useMaskReveal` hook. */
export const compute = (frame, spec) => {
  const { delay = 0, duration = 20, direction = 'left' } = spec || {};
  const relativeFrame = frame - delay;
  if (relativeFrame < 0) return { clipPath: 'inset(0 100% 0 0)', opacity: 1 };

  const progress = Math.min(relativeFrame / duration, 1);
  let clipPath;
  switch (direction) {
    case 'right':
      clipPath = `inset(0 0 0 ${100 - progress * 100}%)`;
      break;
    case 'top':
      clipPath = `inset(0 0 ${100 - progress * 100}% 0)`;
      break;
    case 'bottom':
      clipPath = `inset(${100 - progress * 100}% 0 0 0)`;
      break;
    case 'circle':
      clipPath = `circle(${progress * 100}% at 50% 50%)`;
      break;
    case 'left':
    default:
      clipPath = `inset(0 ${100 - progress * 100}% 0 0)`;
  }

  return { clipPath, opacity: 1 };
};
