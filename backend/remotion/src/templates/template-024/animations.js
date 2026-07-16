import { useFadeInOut, useSlideUp, useSlideDown, useZoomIn } from '../../animations';

export const useTemplate024Animations = ({ frameOffset = 0 } = {}) => {
  const bgFade = useFadeInOut({ fadeIn: frameOffset, fadeInDuration: 10 });
  const topSlide = useSlideDown({ startAt: frameOffset + 3, distance: 200 });
  const bottomSlide = useSlideUp({ startAt: frameOffset + 3, distance: 200 });
  const barGrow = useZoomIn({ startAt: frameOffset + 10, duration: 15, from: 0, to: 1 });
  const labelFade = useFadeInOut({ fadeIn: frameOffset + 15, fadeInDuration: 10 });
  const titleSlide = useSlideUp({ startAt: frameOffset + 20, distance: 30 });

  return { bgStyle: { opacity: bgFade }, topStyle: topSlide, bottomStyle: bottomSlide, barStyle: { transform: `scaleX(${barGrow.opacity || 1})` }, labelStyle: { opacity: labelFade }, titleStyle: titleSlide };
};
