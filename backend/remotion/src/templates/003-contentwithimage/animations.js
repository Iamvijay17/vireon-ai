import { useFadeInOut, useSlideLeft, useZoomIn } from '../../animations';

export const useContentWithImageAnimations = ({ frameOffset = 0 } = {}) => {
  const bgFade = useFadeInOut({ fadeIn: frameOffset, fadeInDuration: 15 });
  const imageZoom = useZoomIn({ startAt: frameOffset, duration: 60, from: 1.12, to: 1 });
  const badgeSlide = useSlideLeft({ startAt: frameOffset + 14, distance: 30 });
  const titleSlide = useSlideLeft({ startAt: frameOffset + 20, distance: 40 });
  const bodySlide = useSlideLeft({ startAt: frameOffset + 28, distance: 50 });

  return { bgStyle: { opacity: bgFade }, imageStyle: imageZoom, badgeStyle: badgeSlide, titleStyle: titleSlide, bodyStyle: bodySlide };
};
