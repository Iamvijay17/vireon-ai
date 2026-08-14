import React from 'react';
import { AbsoluteFill, Audio, Img, interpolate, useCurrentFrame } from 'remotion';
import { backgroundColors } from '../../styles';
import { mergeStyle, positionStyle } from '../../theme';
import { styles } from './styles';

/**
 * 007-title template ("Editorial Banner" variant of the "title" scene
 * type)
 *
 * A news-style layout: a solid accent-colored top ribbon carrying a date-
 * like kicker, a small square thumbnail tucked into the top-right corner,
 * and a huge bottom-anchored title/subtitle block - distinct from 001's
 * centered hero, 002's parallax image, 003's centered minimal, 004's
 * glow-blob hero, 005's thin-framed cover, and 006's split screen. Same
 * elements shape as "001-title".
 *
 * Data format: same as "001-title" -
 * { title, subtitle, image (optional), backgroundColor, styleConfig }.
 */
const Title007 = React.memo(({ scene }) => {
  const frame = useCurrentFrame();
  const elements = scene?.elements || {};
  const title = elements.title || '';
  const subtitle = elements.subtitle || '';
  const image = elements.image || '';
  const bgColor = elements.backgroundColor || backgroundColors.clean;
  const overrides = elements.styleConfig || {};
  const accentColor = overrides.accentColor || '#f59e0b';

  const ribbonScale = interpolate(frame, [0, 18], [0, 1], { extrapolateRight: 'clamp' });
  const thumbOpacity = interpolate(frame, [8, 24], [0, 1], { extrapolateRight: 'clamp' });
  const titleOpacity = interpolate(frame, [16, 34], [0, 1], { extrapolateRight: 'clamp' });
  const titleY = interpolate(frame, [16, 36], [30, 0], { extrapolateRight: 'clamp' });
  const subtitleOpacity = interpolate(frame, [28, 44], [0, 1], { extrapolateRight: 'clamp' });

  const titleStyle = mergeStyle({ ...styles.title, ...positionStyle(overrides.title?.position) }, overrides.title);
  const subtitleStyle = mergeStyle({ ...styles.subtitle, ...positionStyle(overrides.subtitle?.position) }, overrides.subtitle);

  return (
    <AbsoluteFill style={{ backgroundColor: bgColor }}>
      <div style={{ ...styles.background, background: `linear-gradient(180deg, ${bgColor} 0%, #0d1117 100%)` }} />

      <div style={styles.container}>
        <div style={{ ...styles.ribbon, background: accentColor, transform: `scaleX(${ribbonScale})`, transformOrigin: 'left center' }}>
          <span style={styles.kicker}>Now Featured</span>
        </div>

        {image && (
          <div style={{ ...styles.thumb, opacity: thumbOpacity }}>
            <Img src={image} style={styles.thumbImage} />
          </div>
        )}

        <div style={styles.textBlock}>
          {title && (
            <h1
              data-style-role="title"
              style={{
                ...titleStyle,
                opacity: overrides.title?.position ? 1 : titleOpacity,
                transform: overrides.title?.position ? titleStyle.transform : `translateY(${titleY}px)`,
              }}
            >
              {title}
            </h1>
          )}
          {subtitle && (
            <p
              data-style-role="subtitle"
              style={{
                ...subtitleStyle,
                opacity: overrides.subtitle?.position ? 1 : subtitleOpacity,
              }}
            >
              {subtitle}
            </p>
          )}
        </div>
      </div>

      {scene?.audio?.file && <Audio src={scene.audio.file} />}
    </AbsoluteFill>
  );
});

Title007.displayName = 'Title007';
export default Title007;
