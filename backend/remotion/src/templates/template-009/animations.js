import { useFadeInOut, useSlideLeft } from '../../animations';

export const useTemplate009Animations = ({ frameOffset = 0 } = {}) => {
  const bgFade = useFadeInOut({ fadeIn: frameOffset, fadeInDuration: 15 });
  const titleSlide = useSlideLeft({ startAt: frameOffset + 5, distance: 60 });

  const getItemAnim = (index) => {
    const start = frameOffset + 15 + index * 6;
    return useSlideLeft({ startAt: start, distance: 80 });
  };

  return { bgStyle: { opacity: bgFade }, titleStyle: titleSlide, getItemAnim };
};
