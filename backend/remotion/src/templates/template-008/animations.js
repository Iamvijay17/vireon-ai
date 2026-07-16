import { useFadeInOut, useSlideUp, useZoomIn } from '../../animations';

export const useTemplate008Animations = ({ frameOffset = 0 } = {}) => {
  const bgFade = useFadeInOut({ fadeIn: frameOffset, fadeInDuration: 15 });
  const titleSlide = useSlideUp({ startAt: frameOffset + 5, distance: 40 });

  const getPillAnim = (index) => {
    const start = frameOffset + 15 + index * 5;
    return useZoomIn({ startAt: start, duration: 15, from: 0, to: 1 });
  };

  return { bgStyle: { opacity: bgFade }, titleStyle: titleSlide, getPillAnim };
};
