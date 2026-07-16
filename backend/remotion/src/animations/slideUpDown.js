import { useCurrentFrame, spring, useVideoConfig } from 'remotion';

/**
 * Slide Up animation helper
 * @param {Object} options
 * @param {number} options.startAt - Frame to start animation (default: 0)
 * @param {number} options.distance - Pixels to slide (default: 100)
 * @param {boolean} options.useSpring - Use spring animation (default: false)
 * @returns {Object} style object with transform
 */
export const useSlideUp = ({ startAt = 0, distance = 100, useSpring: useSpringAnim = false } = {}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const relativeFrame = frame - startAt;

  if (relativeFrame < 0) {
    return { transform: `translateY(0px)`, opacity: 0 };
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

  const translateY = distance * (1 - progress);
  return {
    transform: `translateY(${translateY}px)`,
    opacity: progress,
  };
};

/**
 * Slide Down animation helper
 * @param {Object} options
 * @param {number} options.startAt - Frame to start animation (default: 0)
 * @param {number} options.distance - Pixels to slide (default: 100)
 * @param {boolean} options.useSpring - Use spring animation (default: false)
 * @returns {Object} style object with transform
 */
export const useSlideDown = ({ startAt = 0, distance = 100, useSpring: useSpringAnim = false } = {}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const relativeFrame = frame - startAt;

  if (relativeFrame < 0) {
    return { transform: `translateY(0px)`, opacity: 0 };
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

  const translateY = -distance * (1 - progress);
  return {
    transform: `translateY(${translateY}px)`,
    opacity: progress,
  };
};
