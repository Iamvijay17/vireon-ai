import { useFadeInOut, useSlideUp, useZoomIn } from '../../animations';

export const useTemplate011Animations = ({ frameOffset = 0 } = {}) => {
  const bgFade = useFadeInOut({ fadeIn: frameOffset, fadeInDuration: 15 });
  const titleSlide = useSlideUp({ startAt: frameOffset + 5, distance: 40 });

  const getCardAnim = (index) => {
    const start = frameOffset + 15 + index * 8;
    return useZoomIn({ startAt: start, duration: 20, from: 0.7, to: 1 });
  };

  return { bgStyle: { opacity: bgFade }, titleStyle: titleSlide, getCardAnim };
};
