import { useFadeInOut, useSlideUp, useZoomIn } from '../../animations';

export const useTemplate019Animations = ({ frameOffset = 0 } = {}) => {
  const bgFade = useFadeInOut({ fadeIn: frameOffset, fadeInDuration: 10 });
  const parallaxZoom = useZoomIn({ startAt: frameOffset, duration: 60, from: 1, to: 1.15 });
  const titleSlide = useSlideUp({ startAt: frameOffset + 8, distance: 60 });
  const subtitleSlide = useSlideUp({ startAt: frameOffset + 18, distance: 40 });
  const ctaFade = useFadeInOut({ fadeIn: frameOffset + 28, fadeInDuration: 20 });

  return { bgStyle: { opacity: bgFade }, parallaxStyle: parallaxZoom, titleStyle: titleSlide, subtitleStyle: subtitleSlide, ctaStyle: { opacity: ctaFade } };
};
