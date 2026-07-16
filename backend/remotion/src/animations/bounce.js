import { useCurrentFrame, spring, useVideoConfig } from 'remotion';

/**
 * Bounce animation helper using spring physics
 * @param {Object} options
 * @param {number} options.startAt - Frame to start animation (default: 0)
 * @param {number} options.scale - Maximum scale during bounce (default: 1.2)
 * @returns {Object} style object with transform
 */
export const useBounce = ({ startAt = 0, scale = 1.2 } = {}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const relativeFrame = frame - startAt;

  if (relativeFrame < 0) {
    return { transform: 'scale(0)', opacity: 0 };
  }

  const springValue = spring({
    frame: relativeFrame,
    fps,
    config: {
      damping: 8,
      mass: 0.5,
      stiffness: 150,
    },
  });

  // Overshoot scale for bounce effect
  const currentScale = 1 + (scale - 1) * springValue * (1 + 0.3 * (1 - springValue));

  return {
    transform: `scale(${currentScale})`,
    opacity: Math.min(springValue * 1.5, 1),
  };
};

/**
 * Pop animation - quick scale up with spring overshoot
 * @param {Object} options
 * @param {number} options.startAt - Frame to start animation (default: 0)
 * @returns {Object} style object with transform
 */
export const usePop = ({ startAt = 0 } = {}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const relativeFrame = frame - startAt;

  if (relativeFrame < 0) {
    return { transform: 'scale(0)', opacity: 0 };
  }

  const springValue = spring({
    frame: relativeFrame,
    fps,
    config: {
      damping: 10,
      mass: 0.3,
      stiffness: 200,
    },
  });

  return {
    transform: `scale(${springValue})`,
    opacity: Math.min(springValue * 1.5, 1),
  };
};
