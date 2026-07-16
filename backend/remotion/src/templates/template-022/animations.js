import { useFadeInOut, useSlideUp, useRotate } from '../../animations';

export const useTemplate022Animations = ({ frameOffset = 0 } = {}) => {
  const bgFade = useFadeInOut({ fadeIn: frameOffset, fadeInDuration: 10 });
  const titleSlide = useSlideUp({ startAt: frameOffset + 5, distance: 40 });

  const getPolaroidAnim = (index, rotate) => {
    const start = frameOffset + 12 + index * 10;
    const fade = useFadeInOut({ fadeIn: start, fadeInDuration: 15 });
    return { opacity: fade };
  };

  return { bgStyle: { opacity: bgFade }, titleStyle: titleSlide, getPolaroidAnim };
};
