import React from 'react';
import { AbsoluteFill, Audio, Img } from 'remotion';
import { backgroundColors } from '../../styles';
import { useFadeInOut, useSlideUp, useZoomIn } from '../../animations';
import { mergeStyle, positionStyle } from '../../theme';
import { styles } from './styles';

/**
 * 002-title template ("Parallax Hero" variant of the "title" scene type)
 *
 * Full-bleed image with a slow parallax zoom, a bottom-anchored gradient
 * overlay, and title/subtitle stacked at the bottom - a cinematic opener,
 * distinct from 001-title's centered gradient-background hero look. Falls
 * back to a plain gradient background when no image is provided. Same
 * elements shape as "001-title".
 *
 * Data format: same as "001-title" -
 * { title, subtitle, image (optional), backgroundColor, styleConfig }.
 */
const Title002 = React.memo(({ scene }) => {
  const elements = scene?.elements || {};
  const title = elements.title || '';
  const subtitle = elements.subtitle || '';
  const image = elements.image || '';
  const bgColor = elements.backgroundColor || backgroundColors.dark;
  const overrides = elements.styleConfig || {};

  const parallax = useZoomIn({ startAt: 0, duration: 100, from: 1, to: 1.15 });
  const bgFade = useFadeInOut({ fadeIn: 0, fadeInDuration: 15 });
  const titleSlide = useSlideUp({ startAt: 10, distance: 50 });
  const subtitleSlide = useSlideUp({ startAt: 20, distance: 35 });

  const titleStyle = mergeStyle(
    { ...styles.title, ...titleSlide, ...positionStyle(overrides.title?.position) },
    overrides.title
  );
  const subtitleStyle = mergeStyle(
    { ...styles.subtitle, ...subtitleSlide, ...positionStyle(overrides.subtitle?.position) },
    overrides.subtitle
  );

  return (
    <AbsoluteFill style={{ backgroundColor: bgColor }}>
      <div style={styles.container}>
        {image ? (
          <div style={{ ...styles.parallaxLayer, transform: parallax.transform }}>
            <Img src={image} style={styles.parallaxImage} />
          </div>
        ) : (
          <div style={{ ...styles.parallaxLayer, background: `linear-gradient(135deg, ${bgColor} 0%, #16213e 50%, #0f3460 100%)` }} />
        )}
        <div style={{ ...styles.overlay, opacity: bgFade }} />
        <div style={styles.content}>
          {title && (
            <h1 data-style-role="title" style={titleStyle}>
              {title}
            </h1>
          )}
          {subtitle && (
            <p data-style-role="subtitle" style={subtitleStyle}>
              {subtitle}
            </p>
          )}
        </div>
      </div>
      {scene?.audio?.file && <Audio src={scene.audio.file} />}
    </AbsoluteFill>
  );
});

Title002.displayName = 'Title002';
export default Title002;
