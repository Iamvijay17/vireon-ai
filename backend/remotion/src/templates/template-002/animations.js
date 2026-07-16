import { useSlideLeft, usePop, useFadeIn } from '../../animations';

/**
 * Template 002 - Q&A animations
 * Question slides from left, pause, answer pops, icons animate
 */
export const useTemplate002Animations = ({ questionDelay = 0, answerDelay = 30 } = {}) => {
  const questionSlide = useSlideLeft({ startAt: questionDelay, distance: 200 });
  const answerPop = usePop({ startAt: answerDelay });
  const iconFade = useFadeIn({ startAt: questionDelay, duration: 20 });

  return {
    questionStyle: questionSlide,
    answerStyle: answerPop,
    iconStyle: { opacity: iconFade },
  };
};
