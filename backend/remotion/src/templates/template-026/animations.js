import { useFadeInOut, useSlideUp, useSlideLeft } from '../../animations';

export const useTemplate026Animations = ({ frameOffset = 0 } = {}) => {
  const bgFade = useFadeInOut({ fadeIn: frameOffset, fadeInDuration: 10 });
  const termSlide = useSlideLeft({ startAt: frameOffset + 5, distance: 40 });
  const dividerSlide = useSlideUp({ startAt: frameOffset + 10, distance: 20 });
  const titleSlide = useSlideUp({ startAt: frameOffset + 15, distance: 50 });
  const defSlide = useSlideUp({ startAt: frameOffset + 22, distance: 40 });
  const exSlide = useSlideUp({ startAt: frameOffset + 30, distance: 30 });

  return { bgStyle: { opacity: bgFade }, termStyle: termSlide, dividerStyle: dividerSlide, titleStyle: titleSlide, defStyle: defSlide, exStyle: exSlide };
};
