import { useFadeInOut, useSlideUp, useZoomIn } from '../../animations';

export const useContentWithImageAnimations = ({ frameOffset = 0 } = {}) => {
  const bgFade = useFadeInOut({ fadeIn: frameOffset, fadeInDuration: 12 });
  const imageZoom = useZoomIn({ startAt: frameOffset, duration: 60, from: 1, to: 1.12 });
  const badgeFade = useFadeInOut({ fadeIn: frameOffset + 8, fadeInDuration: 15 });
  const titleSlide = useSlideUp({ startAt: frameOffset + 15, distance: 40 });
  const bodySlide = useSlideUp({ startAt: frameOffset + 24, distance: 30 });

  return { bgStyle: { opacity: bgFade }, imageStyle: imageZoom, badgeStyle: { opacity: badgeFade }, titleStyle: titleSlide, bodyStyle: bodySlide };
};
