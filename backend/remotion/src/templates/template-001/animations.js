import { useFadeIn, useZoomIn, useSlideUp, useFadeInOut, useBlurReveal } from '../../animations';

/**
 * Template 001 - Educational Card animations
 * Background fades, heading slides from top, subtitle fades, image zooms
 */
export const useTemplate001Animations = ({ frameOffset = 0 } = {}) => {
  const bg = useFadeInOut({ fadeIn: frameOffset, fadeInDuration: 20 });
  const headingSlide = useSlideUp({ startAt: frameOffset + 5, distance: 80 });
  const subtitleFade = useFadeInOut({ fadeIn: frameOffset + 15, fadeInDuration: 25 });
  const imageZoom = useZoomIn({ startAt: frameOffset + 10, duration: 40, from: 0.8, to: 1 });

  // Staggered timing offsets for elements
  return {
    bgStyle: { opacity: bg },
    headingStyle: headingSlide,
    subtitleStyle: { opacity: subtitleFade },
    imageStyle: imageZoom,
  };
};
