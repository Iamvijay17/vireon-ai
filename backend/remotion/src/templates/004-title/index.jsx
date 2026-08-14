import React from 'react';
import { AbsoluteFill, Audio, Img, interpolate, useCurrentFrame } from 'remotion';
import { backgroundColors } from '../../styles';
import { useSlideUp, useZoomIn } from '../../animations';
import { mergeStyle, positionStyle } from '../../theme';
import { styles } from './styles';

/**
 * 004-title template ("Hook Opener" variant of the "title" scene type)
 *
 * Bold, high-impact hero: a huge heavy-weight (900) left-aligned title,
 * an uppercase pill "kicker" badge above it, and a soft glowing color blob
 * in the background - a punchier, more attention-grabbing treatment than
 * 001-title's centered gradient hero, 002-title's parallax image, or
 * 003-title's thin minimal look. The optional image renders as a small
 * framed corner thumbnail rather than a full hero image. Same elements
 * shape as "001-title".
 *
 * Data format: same as "001-title" -
 * { title, subtitle, image (optional), backgroundColor, styleConfig }.
 */
const Title004 = React.memo(({ scene }) => {
  const frame = useCurrentFrame();
  const elements = scene?.elements || {};
  const title = elements.title || '';
  const subtitle = elements.subtitle || '';
  const image = elements.image || '';
  const bgColor = elements.backgroundColor || backgroundColors.dark;
  const overrides = elements.styleConfig || {};
  const accentColor = overrides.accentColor || '#f472b6';

  const kickerFade = interpolate(frame, [0, 15], [0, 1], { extrapolateRight: 'clamp' });
  const titleY = interpolate(frame, [3, 28], [60, 0], { extrapolateRight: 'clamp' });
  const titleOpacity = interpolate(frame, [3, 22], [0, 1], { extrapolateRight: 'clamp' });
  const subtitleOpacity = interpolate(frame, [18, 38], [0, 1], { extrapolateRight: 'clamp' });
  const thumbZoom = useZoomIn({ startAt: 8, duration: 30, from: 0.7, to: 1 });
  const subtitleSlide = useSlideUp({ startAt: 18, distance: 24 });

  const titleStyle = mergeStyle({ ...styles.title, ...positionStyle(overrides.title?.position) }, overrides.title);
  const subtitleStyle = mergeStyle({ ...styles.subtitle, ...positionStyle(overrides.subtitle?.position) }, overrides.subtitle);

  return (
    <AbsoluteFill style={{ backgroundColor: bgColor }}>
      <div style={styles.container}>
        <div style={{ ...styles.glowBlob, background: accentColor, opacity: 0.35 }} />

        {image && (
          <div style={{ ...styles.thumb, ...thumbZoom }}>
            <Img src={image} style={styles.thumbImage} />
          </div>
        )}

        <div style={{ ...styles.kicker, opacity: kickerFade, background: `${accentColor}33`, borderColor: accentColor }}>
          Featured
        </div>

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
              ...(overrides.subtitle?.position ? {} : subtitleSlide),
              opacity: overrides.subtitle?.position ? 1 : subtitleOpacity,
            }}
          >
            {subtitle}
          </p>
        )}
      </div>

      {scene?.audio?.file && <Audio src={scene.audio.file} />}
    </AbsoluteFill>
  );
});

Title004.displayName = 'Title004';
export default Title004;
