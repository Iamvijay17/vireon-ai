import { spring, useCurrentFrame, useVideoConfig } from 'remotion';

/**
 * Fade In animation helper
 * @param {Object} options
 * @param {number} options.startAt - Frame to start animation (default: 0)
 * @param {number} options.duration - Duration of fade in frames (default: 30)
 * @returns {number} opacity value 0-1
 */
export const useFadeIn = ({ startAt = 0, duration = 30 } = {}) => {
  const frame = useCurrentFrame();
  const relativeFrame = frame - startAt;
  if (relativeFrame < 0) return 0;
  if (relativeFrame > duration) return 1;
  return Math.min(relativeFrame / duration, 1);
};

/**
 * Fade Out animation helper
 * @param {Object} options
 * @param {number} options.startAt - Frame to start fade out (default: 0)
 * @param {number} options.duration - Duration of fade out in frames (default: 30)
 * @returns {number} opacity value 0-1
 */
export const useFadeOut = ({ startAt = 0, duration = 30 } = {}) => {
  const frame = useCurrentFrame();
  const relativeFrame = frame - startAt;
  if (relativeFrame < 0) return 1;
  if (relativeFrame > duration) return 0;
  return 1 - Math.min(relativeFrame / duration, 1);
};

/**
 * Fade In/Out combined
 * @param {Object} options
 * @param {number} options.fadeIn - Fade in start frame
 * @param {number} options.fadeInDuration - Fade in duration
 * @param {number} options.fadeOut - Fade out start frame
 * @param {number} options.fadeOutDuration - Fade out duration
 * @returns {number} opacity value 0-1
 */
export const useFadeInOut = ({
  fadeIn = 0,
  fadeInDuration = 30,
  fadeOut = Infinity,
  fadeOutDuration = 30,
} = {}) => {
  const frame = useCurrentFrame();

  // Fade in
  const fadeInFrame = frame - fadeIn;
  const opacityIn = fadeInFrame < 0 ? 0 : Math.min(fadeInFrame / fadeInDuration, 1);

  // Fade out
  const fadeOutFrame = frame - fadeOut;
  const opacityOut = fadeOutFrame < 0 ? 1 : Math.max(1 - fadeOutFrame / fadeOutDuration, 0);

  return Math.min(opacityIn, opacityOut);
};
