import React from 'react';
import { AbsoluteFill, Audio, Img, interpolate, useCurrentFrame } from 'remotion';
import { styles } from './styles';
import { backgroundColors } from '../../styles';
import { mergeStyle, positionStyle } from '../../theme';

/**
 * 007-contentwithimage template ("Duotone Overlay" variant of the
 * "contentwithimage" scene type)
 *
 * Full-bleed image with a strong duotone color-wash overlay (a solid
 * accent-tinted gradient, not a dark bottom scrim), and the badge/title/
 * body text centered over it - a bold color-blocking treatment distinct
 * from 003's dark cinematic scrim and every other contentwithimage
 * variant. Same elements shape as "001-contentwithimage".
 *
 * Data format: same as "001-contentwithimage" -
 * { title, body, image, badge, backgroundColor?, styleConfig }.
 */
const ContentWithImage007 = React.memo(({ scene }) => {
  const frame = useCurrentFrame();
  const elements = scene?.elements || {};
  const title = elements.title || '';
  const body = elements.body || elements.text || '';
  const image = elements.image || '';
  const badge = elements.badge || elements.label || '';
  const bgColor = elements.backgroundColor || backgroundColors.dark;
  const overrides = elements.styleConfig || {};
  const accentColor = overrides.accentColor || '#7c3aed';

  const imageZoom = interpolate(frame, [0, 50], [1.1, 1], { extrapolateRight: 'clamp' });
  const washOpacity = interpolate(frame, [0, 22], [0, 0.72], { extrapolateRight: 'clamp' });
  const badgeOpacity = interpolate(frame, [14, 28], [0, 1], { extrapolateRight: 'clamp' });
  const titleOpacity = interpolate(frame, [18, 36], [0, 1], { extrapolateRight: 'clamp' });
  const titleY = interpolate(frame, [18, 38], [24, 0], { extrapolateRight: 'clamp' });
  const bodyOpacity = interpolate(frame, [28, 46], [0, 1], { extrapolateRight: 'clamp' });

  const titleStyle = mergeStyle({ ...styles.title, ...positionStyle(overrides.title?.position) }, overrides.title);
  const bodyStyle = mergeStyle(styles.body, overrides.body);

  return (
    <AbsoluteFill style={{ backgroundColor: bgColor }}>
      <div style={styles.container}>
        {image && <Img src={image} style={{ ...styles.image, transform: `scale(${imageZoom})` }} />}
        <div style={{ ...styles.wash, background: `linear-gradient(160deg, ${accentColor} 0%, #0d1117 100%)`, opacity: washOpacity }} />

        <div style={styles.textPanel}>
          {badge && <div style={{ ...styles.badge, opacity: badgeOpacity }}>{badge}</div>}
          {title && (
            <h1 data-style-role="title" style={{ ...titleStyle, opacity: titleOpacity, transform: `translateY(${titleY}px)` }}>
              {title}
            </h1>
          )}
          {body && <p style={{ ...bodyStyle, opacity: bodyOpacity }}>{body}</p>}
        </div>
      </div>
      {scene?.audio?.file && <Audio src={scene.audio.file} />}
    </AbsoluteFill>
  );
});

ContentWithImage007.displayName = 'ContentWithImage007';
export default ContentWithImage007;
