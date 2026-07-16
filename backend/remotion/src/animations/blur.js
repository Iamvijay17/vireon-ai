import { useCurrentFrame, interpolate } from 'remotion';

/**
 * Blur Reveal animation helper
 * Starts blurred and clears up
 * @param {Object} options
 * @param {number} options.startAt - Frame to start animation (default: 0)
 * @param {number} options.duration - Duration in frames (default: 30)
 * @param {number} options.maxBlur - Maximum blur in pixels (default: 20)
 * @returns {Object} style object with filter and opacity
 */
export const useBlurReveal = ({ startAt = 0, duration = 30, maxBlur = 20 } = {}) => {
  const frame = useCurrentFrame();
  const relativeFrame = frame - startAt;

  if (relativeFrame < 0) {
    return { filter: `blur(${maxBlur}px)`, opacity: 0 };
  }

  const progress = Math.min(relativeFrame / duration, 1);
  const blur = interpolate(progress, [0, 1], [maxBlur, 0]);

  return {
    filter: `blur(${blur}px)`,
    opacity: interpolate(progress, [0, 0.5, 1], [0, 0.5, 1]),
  };
};
