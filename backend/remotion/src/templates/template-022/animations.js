import { useFadeInOut, useSlideUp, useRotate } from '../../animations';

export const useTemplate022Animations = ({ frameOffset = 0 } = {}) => {
  const bgFade = useFadeInOut({ fadeIn: frameOffset, fadeInDuration: 10 });
  const titleSlide = useSlideUp({ startAt: frameOffset + 5, distance: 40 });
  const polaroidFade0 = useFadeInOut({ fadeIn: frameOffset + 12, fadeInDuration: 15 });
  const polaroidFade1 = useFadeInOut({ fadeIn: frameOffset + 22, fadeInDuration: 15 });

  return {
    bgStyle: { opacity: bgFade },
    titleStyle: titleSlide,
    polaroidStyle0: { opacity: polaroidFade0 },
    polaroidStyle1: { opacity: polaroidFade1 },
  };
};
