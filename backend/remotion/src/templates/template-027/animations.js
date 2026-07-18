import { useFadeInOut, useSlideLeft } from '../../animations';

/**
 * Non-hook animation helper - computes slide animation values from frame
 * This can be safely called in loops without violating React's Hook rules
 */
export const getChecklistItemAnimation = (frame, fps, startOffset, distance = 60) => {
  const relativeFrame = frame - startOffset;
  if (relativeFrame < 0) {
    return { transform: `translateX(${distance}px)`, opacity: 0 };
  }
  const progress = Math.min(relativeFrame / 30, 1);
  const translateX = distance * (1 - progress);
  return {
    transform: `translateX(${translateX}px)`,
    opacity: progress,
  };
};

export const useTemplate027Animations = ({ frameOffset = 0 } = {}) => {
  const bgFade = useFadeInOut({ fadeIn: frameOffset, fadeInDuration: 10 });
  const titleSlide = useSlideLeft({ startAt: frameOffset + 5, distance: 40 });

  return { bgStyle: { opacity: bgFade }, titleStyle: titleSlide };
};
