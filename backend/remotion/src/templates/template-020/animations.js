import { useFadeInOut, useSlideUp, useZoomIn } from '../../animations';

export const useTemplate020Animations = ({ frameOffset = 0 } = {}) => {
  const bgFade = useFadeInOut({ fadeIn: frameOffset, fadeInDuration: 10 });
  const imageZoom = useZoomIn({ startAt: frameOffset + 2, duration: 35, from: 1, to: 1.08 });
  const dividerSlide = useSlideUp({ startAt: frameOffset + 12, distance: 20 });
  const labelFade = useFadeInOut({ fadeIn: frameOffset + 10, fadeInDuration: 12 });
  const titleSlide = useSlideUp({ startAt: frameOffset + 18, distance: 40 });
  const bodySlide = useSlideUp({ startAt: frameOffset + 25, distance: 30 });

  return { bgStyle: { opacity: bgFade }, imageStyle: imageZoom, dividerStyle: dividerSlide, labelStyle: { opacity: labelFade }, titleStyle: titleSlide, bodyStyle: bodySlide };
};
