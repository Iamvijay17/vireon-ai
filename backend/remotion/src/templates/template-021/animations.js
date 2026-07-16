import { useFadeInOut, useSlideUp, useZoomIn } from '../../animations';

export const useTemplate021Animations = ({ frameOffset = 0 } = {}) => {
  const bgFade = useFadeInOut({ fadeIn: frameOffset, fadeInDuration: 10 });
  const imageZoom = useZoomIn({ startAt: frameOffset, duration: 60, from: 1, to: 1.2 });
  const lineGrow = useZoomIn({ startAt: frameOffset + 10, duration: 15, from: 0, to: 1 });
  const titleSlide = useSlideUp({ startAt: frameOffset + 15, distance: 50 });
  const bodySlide = useSlideUp({ startAt: frameOffset + 25, distance: 40 });

  return { bgStyle: { opacity: bgFade }, imageStyle: imageZoom, lineStyle: { transform: `scaleX(${lineGrow})` }, titleStyle: titleSlide, bodyStyle: bodySlide };
};
