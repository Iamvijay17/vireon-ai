import { useFadeInOut, useSlideUp, usePop } from '../../animations';

export const useTemplate015Animations = ({ frameOffset = 0 } = {}) => {
  const bgFade = useFadeInOut({ fadeIn: frameOffset, fadeInDuration: 15 });
  const titleSlide = useSlideUp({ startAt: frameOffset + 5, distance: 40 });

  const getItemAnim = (index) => {
    const start = frameOffset + 15 + index * 4;
    return usePop({ startAt: start });
  };

  return { bgStyle: { opacity: bgFade }, titleStyle: titleSlide, getItemAnim };
};
