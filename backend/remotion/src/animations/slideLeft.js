import { useCurrentFrame, spring, useVideoConfig } from 'remotion';

/**
 * Slide Left animation helper
 * @param {Object} options
 * @param {number} options.startAt - Frame to start animation (default: 0)
 * @param {number} options.distance - Pixels to slide (default: 100)
 * @param {boolean} options.useSpring - Use spring animation (default: false)
 * @returns {Object} style object with transform
 */
export const useSlideLeft = ({ startAt = 0, distance = 100, useSpring: useSpringAnim = false } = {}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const relativeFrame = frame - startAt;

  if (relativeFrame < 0) {
    return { transform: `translateX(0px)`, opacity: 0 };
  }

  let progress;
  if (useSpringAnim) {
    progress = spring({
      frame: relativeFrame,
      fps,
      config: { damping: 12, mass: 0.5, stiffness: 100 },
    });
  } else {
    progress = Math.min(relativeFrame / 30, 1);
  }

  const translateX = distance * (1 - progress);
  return {
    transform: `translateX(${translateX}px)`,
    opacity: progress,
  };
};

/**
 * Slide Right animation helper
 * @param {Object} options
 * @param {number} options.startAt - Frame to start animation (default: 0)
 * @param {number} options.distance - Pixels to slide (default: 100)
 * @param {boolean} options.useSpring - Use spring animation (default: false)
 * @returns {Object} style object with transform
 */
export const useSlideRight = ({ startAt = 0, distance = 100, useSpring: useSpringAnim = false } = {}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const relativeFrame = frame - startAt;

  if (relativeFrame < 0) {
    return { transform: `translateX(0px)`, opacity: 0 };
  }

  let progress;
  if (useSpringAnim) {
    progress = spring({
      frame: relativeFrame,
      fps,
      config: { damping: 12, mass: 0.5, stiffness: 100 },
    });
  } else {
    progress = Math.min(relativeFrame / 30, 1);
  }

  const translateX = -distance * (1 - progress);
  return {
    transform: `translateX(${translateX}px)`,
    opacity: progress,
  };
};
