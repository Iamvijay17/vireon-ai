import { useZoomIn, useFadeIn, useBlurReveal, useSlideUp } from '../../animations';

/**
 * Template 003 - Image Focus animations
 * Image zoom in, caption fades in, background blur
 */
export const useTemplate003Animations = ({ frameOffset = 0 } = {}) => {
  const imageZoom = useZoomIn({ startAt: frameOffset, duration: 50, from: 1, to: 1.15 });
  const captionSlide = useSlideUp({ startAt: frameOffset + 20, distance: 60 });
  const labelFade = useFadeIn({ startAt: frameOffset + 15, duration: 20 });
  const bgBlur = useBlurReveal({ startAt: frameOffset, duration: 30, maxBlur: 5 });

  return {
    imageStyle: { ...imageZoom, ...bgBlur },
    captionStyle: captionSlide,
    labelStyle: { opacity: labelFade },
  };
};
