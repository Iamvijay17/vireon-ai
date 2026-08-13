import { useCurrentFrame, interpolate } from 'remotion';
import { useFadeInOut, useSlideUp } from '../../animations';

export const useTemplate011Animations = ({ frameOffset = 0 } = {}) => {
  const bgFade = useFadeInOut({ fadeIn: frameOffset, fadeInDuration: 15 });
  const titleSlide = useSlideUp({ startAt: frameOffset + 5, distance: 40 });
  // Read the frame once here (a fixed, unconditional hook call) rather than
  // calling `useZoomIn` - itself a hook - once per card inside `.map()`
  // below: the number of cards varies with scene data, and calling a hook a
  // variable number of times violates the Rules of Hooks.
  const frame = useCurrentFrame();

  const getCardAnim = (index) => {
    const start = frameOffset + 15 + index * 8;
    const relativeFrame = frame - start;
    if (relativeFrame < 0) return { transform: 'scale(0.7)', opacity: 0 };
    const progress = Math.min(relativeFrame / 20, 1);
    const scale = interpolate(progress, [0, 1], [0.7, 1]);
    return { transform: `scale(${scale})`, opacity: progress };
  };

  return { bgStyle: { opacity: bgFade }, titleStyle: titleSlide, getCardAnim };
};
