import { useFadeInOut, useSlideUp } from '../../animations';

export const useTemplate028Animations = ({ frameOffset = 0 } = {}) => {
  const bgFade = useFadeInOut({ fadeIn: frameOffset, fadeInDuration: 10 });
  const titleSlide = useSlideUp({ startAt: frameOffset + 5, distance: 40 });
  const subSlide = useSlideUp({ startAt: frameOffset + 10, distance: 30 });

  const getRowAnim = (index) => {
    const start = frameOffset + 15 + index * 4;
    return useSlideUp({ startAt: start, distance: 30 });
  };

  return { bgStyle: { opacity: bgFade }, titleStyle: titleSlide, subStyle: subSlide, getRowAnim };
};
