import { useCurrentFrame, interpolate, spring, useVideoConfig } from 'remotion';

/**
 * Rotate animation helper
 * @param {Object} options
 * @param {number} options.startAt - Frame to start animation (default: 0)
 * @param {number} options.duration - Duration in frames (default: 30)
 * @param {number} options.from - Starting rotation in degrees (default: -180)
 * @param {number} options.to - Ending rotation in degrees (default: 0)
 * @returns {Object} style object with transform
 */
export const useRotate = ({ startAt = 0, duration = 30, from = -180, to = 0 } = {}) => {
  const frame = useCurrentFrame();
  const relativeFrame = frame - startAt;

  if (relativeFrame < 0) {
    return { transform: `rotate(${from}deg)`, opacity: 0 };
  }

  const progress = Math.min(relativeFrame / duration, 1);
  const rotation = interpolate(progress, [0, 1], [from, to]);

  return {
    transform: `rotate(${rotation}deg)`,
    opacity: progress,
  };
};
