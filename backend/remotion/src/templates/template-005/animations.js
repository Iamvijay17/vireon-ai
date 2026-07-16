import { useSlideLeft, useSlideRight, usePop, useBounce, useFadeIn } from '../../animations';

/**
 * Template 005 - Comparison animations
 * Left card slides from left, right card slides from right, VS badge pops in center
 */
export const useTemplate005Animations = ({ leftDelay = 0, vsDelay = 20, rightDelay = 25 } = {}) => {
  const leftCard = useSlideLeft({ startAt: leftDelay, distance: 200 });
  const rightCard = useSlideRight({ startAt: rightDelay, distance: 200 });
  const vsBadge = useBounce({ startAt: vsDelay, scale: 1.3 });
  const headerFade = useFadeIn({ startAt: leftDelay, duration: 20 });

  return {
    leftStyle: leftCard,
    rightStyle: rightCard,
    vsStyle: vsBadge,
    headerStyle: { opacity: headerFade },
  };
};
