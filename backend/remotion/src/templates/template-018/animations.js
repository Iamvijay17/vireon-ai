import { useFadeInOut, useSlideUp } from '../../animations';

export const useTemplate018Animations = ({ frameOffset = 0 } = {}) => {
  const bgFade = useFadeInOut({ fadeIn: frameOffset, fadeInDuration: 10 });

  const getImageAnim = (index) => {
    const start = frameOffset + 5 + index * 6;
    return useSlideUp({ startAt: start, distance: 60 });
  };

  const overlayFade = useFadeInOut({ fadeIn: frameOffset + 35, fadeInDuration: 15 });

  return { bgStyle: { opacity: bgFade }, getImageAnim, overlayStyle: { opacity: overlayFade } };
};
