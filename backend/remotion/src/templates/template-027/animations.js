import { useFadeInOut, useSlideLeft } from '../../animations';

export const useTemplate027Animations = ({ frameOffset = 0 } = {}) => {
  const bgFade = useFadeInOut({ fadeIn: frameOffset, fadeInDuration: 10 });
  const titleSlide = useSlideLeft({ startAt: frameOffset + 5, distance: 40 });

  const getItemAnim = (index) => {
    const start = frameOffset + 12 + index * 6;
    return useSlideLeft({ startAt: start, distance: 60 });
  };

  return { bgStyle: { opacity: bgFade }, titleStyle: titleSlide, getItemAnim };
};
