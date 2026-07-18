import { useCurrentFrame, useVideoConfig, spring } from 'remotion';

/**
 * Non-hook animation helper for timeline items
 * This can be safely called in loops without violating React's Hook rules
 */
export const getTimelineItemAnimations = (frame, fps, index) => {
  const delay = index * 15;
  const isLeft = index % 2 === 0;

  // Compute slide animation
  const relativeFrame = frame - delay;
  const slideOpacity = relativeFrame < 0 ? 0 : Math.min(relativeFrame / 30, 1);
  const slideTranslateX = isLeft 
    ? -100 * (1 - slideOpacity) // slide from left to center
    : 100 * (1 - slideOpacity); // slide from right to center
  const slideAnim = {
    transform: `translateX(${slideTranslateX}px)`,
    opacity: slideOpacity,
  };

  // Compute dot pop animation
  const dotProgress = relativeFrame < 0 ? 0 : spring({
    frame: relativeFrame,
    fps,
    config: { damping: 12, mass: 0.5, stiffness: 100 },
  });
  const dotScale = 0.5 + 0.5 * dotProgress;
  const dotAnim = {
    transform: `scale(${dotScale})`,
    opacity: slideOpacity,
  };

  return {
    dotStyle: dotAnim,
    cardAnim: slideAnim,
  };
};

export const useTemplate004Background = ({ frameOffset = 0 } = {}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  
  const relativeFrame = frame - frameOffset;
  const opacity = relativeFrame < 0 ? 0 : Math.min(relativeFrame / 30, 1);
  
  return { opacity };
};
