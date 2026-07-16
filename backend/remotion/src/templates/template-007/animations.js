import { useFadeInOut, useSlideUp, useBounce } from '../../animations';

/**
 * Template 007 - Stats/Data Dashboard
 * Stats cards bouncing in from bottom with staggered timing
 */
export const useTemplate007Animations = ({ frameOffset = 0 } = {}) => {
  const bgFade = useFadeInOut({ fadeIn: frameOffset, fadeInDuration: 15 });

  const getCardAnim = (index) => {
    const start = frameOffset + 10 + index * 10;
    return useSlideUp({ startAt: start, distance: 80 });
  };

  return {
    bgStyle: { opacity: bgFade },
    getCardAnim,
  };
};
