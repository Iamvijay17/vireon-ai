import { useFadeInOut, useSlideLeft, useSlideRight, useSlideUp } from '../../animations';

export const useTemplate010Animations = ({ frameOffset = 0 } = {}) => {
  const bgFade = useFadeInOut({ fadeIn: frameOffset, fadeInDuration: 15 });
  const leftSlide = useSlideLeft({ startAt: frameOffset + 5, distance: 100 });
  const rightSlide = useSlideRight({ startAt: frameOffset + 5, distance: 100 });
  const lineGrow = useSlideUp({ startAt: frameOffset + 15, distance: 20 });
  const statFade = useFadeInOut({ fadeIn: frameOffset + 20, fadeInDuration: 20 });

  return { bgStyle: { opacity: bgFade }, leftStyle: leftSlide, rightStyle: rightSlide, lineStyle: { opacity: lineGrow.opacity }, statStyle: { opacity: statFade } };
};
