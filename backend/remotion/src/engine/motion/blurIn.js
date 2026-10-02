import { interpolate } from 'remotion';

export const id = 'blurIn';

/** Ported from animations/blur.js's `useBlurReveal` hook. */
export const compute = (frame, spec) => {
  const { delay = 0, duration = 20, maxBlur = 20 } = spec || {};
  const relativeFrame = frame - delay;
  if (relativeFrame < 0) return { opacity: 0, filter: `blur(${maxBlur}px)` };

  const progress = Math.min(relativeFrame / duration, 1);
  const blur = interpolate(progress, [0, 1], [maxBlur, 0]);

  return {
    filter: `blur(${blur}px)`,
    opacity: interpolate(progress, [0, 0.5, 1], [0, 0.5, 1]),
  };
};
