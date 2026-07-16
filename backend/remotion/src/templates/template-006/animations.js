import { useFadeInOut, useSlideUp, useZoomIn } from '../../animations';

/**
 * Template 006 - Quote/Testimonial
 * Pull quote with author attribution, staggered reveal
 */
export const useTemplate006Animations = ({ frameOffset = 0 } = {}) => {
  const bgFade = useFadeInOut({ fadeIn: frameOffset, fadeInDuration: 15 });
  const quoteSlide = useSlideUp({ startAt: frameOffset + 5, distance: 60 });
  const lineGrow = useZoomIn({ startAt: frameOffset + 20, duration: 20, from: 0, to: 1 });
  const authorFade = useFadeInOut({ fadeIn: frameOffset + 25, fadeInDuration: 20 });

  return {
    bgStyle: { opacity: bgFade },
    quoteStyle: quoteSlide,
    lineStyle: { transform: `scaleX(${lineGrow.opacity || lineGrow})`, opacity: lineGrow.opacity || lineGrow },
    authorStyle: { opacity: authorFade },
  };
};
