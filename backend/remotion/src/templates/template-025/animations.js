import { useFadeInOut, useSlideUp, useZoomIn } from '../../animations';

export const useTemplate025Animations = ({ frameOffset = 0 } = {}) => {
  const bgFade = useFadeInOut({ fadeIn: frameOffset, fadeInDuration: 10 });
  const imageZoom = useZoomIn({ startAt: frameOffset, duration: 50, from: 1, to: 1.1 });
  const revealSlide = useSlideUp({ startAt: frameOffset + 5, distance: '100%' });
  const tagFade = useFadeInOut({ fadeIn: frameOffset + 20, fadeInDuration: 10 });
  const titleSlide = useSlideUp({ startAt: frameOffset + 25, distance: 40 });
  const bodySlide = useSlideUp({ startAt: frameOffset + 32, distance: 30 });

  return { bgStyle: { opacity: bgFade }, imageStyle: imageZoom, revealStyle: { transform: `translateY(${revealSlide.transform ? '0%' : '100%'})`, opacity: revealSlide.opacity }, tagStyle: { opacity: tagFade }, titleStyle: titleSlide, bodyStyle: bodySlide };
};
