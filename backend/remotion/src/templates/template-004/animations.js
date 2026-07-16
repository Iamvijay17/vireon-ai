import { useSlideLeft, useSlideRight, useFadeIn, usePop } from '../../animations';

/**
 * Template 004 - Timeline animations
 * Cards appear one by one, alternating left and right
 */
export const useTimelineItemAnimations = (index) => {
  const delay = index * 15;

  const isLeft = index % 2 === 0;
  const slideAnim = isLeft
    ? useSlideRight({ startAt: delay, distance: 100 })
    : useSlideLeft({ startAt: delay, distance: 100 });

  const dotAnim = usePop({ startAt: delay });
  const cardAnim = useSlideLeft({ startAt: delay + 3, distance: 60 });

  return {
    dotStyle: dotAnim,
    cardAnim: slideAnim,
  };
};
