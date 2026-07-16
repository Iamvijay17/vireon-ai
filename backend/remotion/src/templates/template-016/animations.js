import { useFadeInOut, useZoomIn, useSlideUp } from '../../animations';

export const useTemplate016Animations = ({ frameOffset = 0 } = {}) => {
  const bgFade = useFadeInOut({ fadeIn: frameOffset, fadeInDuration: 10 });

  const getImageAnim = (index) => {
    const start = frameOffset + 5 + index * 8;
    return useZoomIn({ startAt: start, duration: 20, from: 0.5, to: 1 });
  };

  const overlayFade = useFadeInOut({ fadeIn: frameOffset + 35, fadeInDuration: 15 });
  const captionSlide = useSlideUp({ startAt: frameOffset + 38, distance: 30 });

  return { bgStyle: { opacity: bgFade }, getImageAnim, overlayStyle: { opacity: overlayFade }, captionStyle: captionSlide };
};
