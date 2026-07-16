import { useCurrentFrame, interpolate } from 'remotion';

/**
 * Mask Reveal animation helper
 * Reveals content using a clip-path mask
 * @param {Object} options
 * @param {number} options.startAt - Frame to start animation (default: 0)
 * @param {number} options.duration - Duration in frames (default: 30)
 * @param {string} options.direction - Direction of reveal: 'left', 'right', 'top', 'bottom', 'circle' (default: 'left')
 * @returns {Object} style object with clipPath
 */
export const useMaskReveal = ({ startAt = 0, duration = 30, direction = 'left' } = {}) => {
  const frame = useCurrentFrame();
  const relativeFrame = frame - startAt;

  if (relativeFrame < 0) {
    return { clipPath: 'inset(0 100% 0 0)', opacity: 1 };
  }

  const progress = Math.min(relativeFrame / duration, 1);

  let clipPath;
  switch (direction) {
    case 'left':
      clipPath = `inset(0 ${100 - progress * 100}% 0 0)`;
      break;
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
    default:
      clipPath = `inset(0 ${100 - progress * 100}% 0 0)`;
  }

  return {
    clipPath,
    opacity: 1,
  };
};
