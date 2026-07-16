import { useFadeInOut, useSlideLeft } from '../../animations';
export const useTemplate029Animations = ({ frameOffset = 0 } = {}) => {
  const bgFade = useFadeInOut({ fadeIn: frameOffset, fadeInDuration: 10 });
  const titleSlide = useSlideLeft({ startAt: frameOffset + 5, distance: 40 });
  const subSlide = useSlideLeft({ startAt: frameOffset + 10, distance: 30 });
  const getFactAnim = (i) => useSlideLeft({ startAt: frameOffset + 15 + i * 6, distance: 60 });
  return { bgStyle: { opacity: bgFade }, titleStyle: titleSlide, subStyle: subSlide, getFactAnim };
};
