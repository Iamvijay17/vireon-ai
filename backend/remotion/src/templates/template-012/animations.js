import { useFadeInOut, useSlideUp, useBounce } from '../../animations';

export const useTemplate012Animations = ({ frameOffset = 0 } = {}) => {
  const bgFade = useFadeInOut({ fadeIn: frameOffset, fadeInDuration: 15 });
  const titleSlide = useSlideUp({ startAt: frameOffset + 5, distance: 40 });

  const getBlockAnim = (index) => {
    const start = frameOffset + 15 + index * 5;
    return useBounce({ startAt: start });
  };

  const msgFade = useFadeInOut({ fadeIn: frameOffset + 35, fadeInDuration: 20 });

  return { bgStyle: { opacity: bgFade }, titleStyle: titleSlide, getBlockAnim, msgStyle: { opacity: msgFade } };
};
