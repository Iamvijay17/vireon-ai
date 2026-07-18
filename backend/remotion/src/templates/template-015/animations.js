import { useFadeInOut, useSlideUp } from '../../animations';

/**
 * Non-hook animation helper - computes pop animation values from frame
 * This can be safely called in loops without violating React's Hook rules
 */
export const getFeatureItemAnimation = (frame, index, frameOffset = 0) => {
  const relativeFrame = frame - (frameOffset + 15 + index * 4);
  if (relativeFrame < 0) {
    return { transform: 'scale(0.8)', opacity: 0 };
  }
  const progress = Math.min(relativeFrame / 15, 1);
  const scale = 0.8 + 0.2 * progress; // scale from 0.8 to 1
  return {
    transform: `scale(${scale})`,
    opacity: progress,
  };
};

export const useTemplate015Animations = ({ frameOffset = 0 } = {}) => {
  const bgFade = useFadeInOut({ fadeIn: frameOffset, fadeInDuration: 15 });
  const titleSlide = useSlideUp({ startAt: frameOffset + 5, distance: 40 });

  return { bgStyle: { opacity: bgFade }, titleStyle: titleSlide };
};
