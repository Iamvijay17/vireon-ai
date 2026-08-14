import { useFadeInOut } from '../../animations';
import { interpolate, useCurrentFrame } from 'remotion';

export const useSplitRevealAnimations = ({ frameOffset = 0 } = {}) => {
  const frame = useCurrentFrame();
  const panelX = interpolate(frame, [frameOffset, frameOffset + 26], [-60, 0], { extrapolateRight: 'clamp' });
  const panelOpacity = interpolate(frame, [frameOffset, frameOffset + 16], [0, 1], { extrapolateRight: 'clamp' });
  const badgeFade = useFadeInOut({ fadeIn: frameOffset + 18, fadeInDuration: 15 });
  const titleFade = useFadeInOut({ fadeIn: frameOffset + 24, fadeInDuration: 18 });
  const bodyFade = useFadeInOut({ fadeIn: frameOffset + 32, fadeInDuration: 18 });
  const imageZoom = interpolate(frame, [frameOffset, frameOffset + 50], [1.08, 1], { extrapolateRight: 'clamp' });

  return {
    panelStyle: { transform: `translateX(${panelX}%)`, opacity: panelOpacity },
    badgeStyle: { opacity: badgeFade },
    titleStyle: { opacity: titleFade },
    bodyStyle: { opacity: bodyFade },
    imageStyle: { transform: `scale(${imageZoom})` },
  };
};
