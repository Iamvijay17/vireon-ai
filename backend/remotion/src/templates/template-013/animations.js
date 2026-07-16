import { useFadeInOut, useSlideLeft } from '../../animations';

export const useTemplate013Animations = ({ frameOffset = 0 } = {}) => {
  const bgFade = useFadeInOut({ fadeIn: frameOffset, fadeInDuration: 15 });
  const headerFade = useFadeInOut({ fadeIn: frameOffset + 5, fadeInDuration: 15 });

  const getStepAnim = (index) => {
    const start = frameOffset + 15 + index * 8;
    return useSlideLeft({ startAt: start, distance: 60 });
  };

  return { bgStyle: { opacity: bgFade }, headerStyle: { opacity: headerFade }, getStepAnim };
};
