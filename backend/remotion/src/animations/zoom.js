import { useCurrentFrame, spring, useVideoConfig, interpolate } from 'remotion';

/**
 * Zoom In animation helper
 * @param {Object} options
 * @param {number} options.startAt - Frame to start animation (default: 0)
 * @param {number} options.duration - Duration in frames (default: 30)
 * @param {number} options.from - Starting scale (default: 0.5)
 * @param {number} options.to - Ending scale (default: 1)
 * @returns {Object} style object with transform
 */
export const useZoomIn = ({ startAt = 0, duration = 30, from = 0.5, to = 1 } = {}) => {
  const frame = useCurrentFrame();
  const relativeFrame = frame - startAt;

  if (relativeFrame < 0) {
    return { transform: `scale(${from})`, opacity: 0 };
  }

  const progress = Math.min(relativeFrame / duration, 1);
  const scale = interpolate(progress, [0, 1], [from, to]);

  return {
    transform: `scale(${scale})`,
    opacity: progress,
  };
};

/**
 * Zoom Out animation helper
 * @param {Object} options
 * @param {number} options.startAt - Frame to start animation (default: 0)
 * @param {number} options.duration - Duration in frames (default: 30)
 * @param {number} options.from - Starting scale (default: 1)
 * @param {number} options.to - Ending scale (default: 1.5)
 * @returns {Object} style object with transform
 */
export const useZoomOut = ({ startAt = 0, duration = 30, from = 1, to = 1.5 } = {}) => {
  const frame = useCurrentFrame();
  const relativeFrame = frame - startAt;

  if (relativeFrame < 0) {
    return { transform: `scale(${from})`, opacity: 1 };
  }

  const progress = Math.min(relativeFrame / duration, 1);
  const scale = interpolate(progress, [0, 1], [from, to]);

  return {
    transform: `scale(${scale})`,
    opacity: 1 - progress * 0.3,
  };
};
