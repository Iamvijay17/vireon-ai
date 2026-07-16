import { useFadeInOut, useSlideLeft } from '../../animations';

export const useTemplate023Animations = ({ frameOffset = 0 } = {}) => {
  const bgFade = useFadeInOut({ fadeIn: frameOffset, fadeInDuration: 10 });
  const titleSlide = useSlideLeft({ startAt: frameOffset + 5, distance: 40 });

  const getCardAnim = (index) => {
    const start = frameOffset + 12 + index * 6;
    return useSlideLeft({ startAt: start, distance: 80 });
  };

  return { bgStyle: { opacity: bgFade }, titleStyle: titleSlide, getCardAnim };
};
