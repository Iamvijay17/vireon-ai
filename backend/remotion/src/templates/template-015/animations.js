import { useFadeInOut, useSlideUp, usePop } from '../../animations';

export const useTemplate015Animations = ({ frameOffset = 0 } = {}) => {
  const bgFade = useFadeInOut({ fadeIn: frameOffset, fadeInDuration: 15 });
  const titleSlide = useSlideUp({ startAt: frameOffset + 5, distance: 40 });

  // Compute item animations without calling hooks in a loop
  const itemAnimations = [];
  for (let i = 0; i < 20; i++) {
    const start = frameOffset + 15 + i * 4;
    itemAnimations[i] = usePop({ startAt: start });
  }

  return { bgStyle: { opacity: bgFade }, titleStyle: titleSlide, itemAnimations };
};
