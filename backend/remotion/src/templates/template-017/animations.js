import { useFadeInOut, useSlideLeft, useZoomIn } from '../../animations';

export const useTemplate017Animations = ({ frameOffset = 0 } = {}) => {
  const bgFade = useFadeInOut({ fadeIn: frameOffset, fadeInDuration: 10 });
  const imageZoom = useZoomIn({ startAt: frameOffset + 3, duration: 40, from: 1.1, to: 1 });
  const badgeSlide = useSlideLeft({ startAt: frameOffset + 10, distance: 40 });
  const titleSlide = useSlideLeft({ startAt: frameOffset + 15, distance: 50 });
  const bodySlide = useSlideLeft({ startAt: frameOffset + 22, distance: 60 });

  return { bgStyle: { opacity: bgFade }, imageStyle: imageZoom, badgeStyle: badgeSlide, titleStyle: titleSlide, bodyStyle: bodySlide };
};
