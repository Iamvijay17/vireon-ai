import { useFadeInOut, useSlideUp, useZoomIn } from '../../animations';

export const useTemplate014Animations = ({ frameOffset = 0 } = {}) => {
  const bgFade = useFadeInOut({ fadeIn: frameOffset, fadeInDuration: 15 });
  const titleSlide = useSlideUp({ startAt: frameOffset + 5, distance: 40 });

  const getBarAnim = (index) => {
    const start = frameOffset + 15 + index * 5;
    return useZoomIn({ startAt: start, duration: 20, from: 0, to: 1 });
  };

  const barFillAnim = (index, widthPct) => {
    const start = frameOffset + 15 + index * 5;
    return useZoomIn({ startAt: start, duration: 25, from: 0, to: widthPct / 100 });
  };

  return { bgStyle: { opacity: bgFade }, titleStyle: titleSlide, getBarAnim, barFillAnim };
};
