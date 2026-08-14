import React from 'react';
import { AbsoluteFill, Audio, Img, interpolate, useCurrentFrame } from 'remotion';
import { backgroundColors } from '../../styles';
import { mergeStyle, positionStyle } from '../../theme';
import { styles } from './styles';

/**
 * 006-image template ("Side Caption Bar" variant of the "image" scene
 * type)
 *
 * The image fills most of the frame with a solid vertical caption bar
 * anchored to the right edge (label + caption stacked, rotated writing
 * feel avoided - plain horizontal text in a narrow sidebar) instead of a
 * bottom gradient overlay - distinct from 001's bottom caption, 002's
 * vignette, 003's layered frame, 004's parchment frame, and 005's
 * polaroid card. Same elements shape as "001-image".
 *
 * Data format: same as "001-image" -
 * { image, caption, label, overlayColor? (optional), backgroundColor, styleConfig }.
 */
const Image006 = React.memo(({ scene }) => {
  const frame = useCurrentFrame();
  const elements = scene?.elements || {};
  const image = elements.image || '';
  const caption = elements.caption || '';
  const label = elements.label || '';
  const bgColor = elements.backgroundColor || backgroundColors.clean;
  const overrides = elements.styleConfig || {};

  const imageZoom = interpolate(frame, [0, 50], [1.08, 1], { extrapolateRight: 'clamp' });
  const barX = interpolate(frame, [6, 28], [40, 0], { extrapolateRight: 'clamp' });
  const barOpacity = interpolate(frame, [6, 24], [0, 1], { extrapolateRight: 'clamp' });
  const labelOpacity = interpolate(frame, [18, 32], [0, 1], { extrapolateRight: 'clamp' });
  const captionOpacity = interpolate(frame, [24, 40], [0, 1], { extrapolateRight: 'clamp' });

  const labelStyle = mergeStyle({ ...styles.label, ...positionStyle(overrides.subtitle?.position) }, overrides.subtitle);
  const captionStyle = mergeStyle({ ...styles.caption, ...positionStyle(overrides.title?.position) }, overrides.title);

  return (
    <AbsoluteFill style={{ backgroundColor: bgColor }}>
      <div style={styles.container}>
        <div style={styles.imageArea}>
          {image ? (
            <Img src={image} style={{ ...styles.image, transform: `scale(${imageZoom})` }} />
          ) : (
            <div style={{ ...styles.image, display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: '#111827' }}>
              <span style={{ color: 'rgba(255,255,255,0.3)', fontSize: 18 }}>No Image</span>
            </div>
          )}
        </div>

        <div style={{ ...styles.bar, opacity: barOpacity, transform: `translateX(${barX}px)` }}>
          {label && (
            <p data-style-role="subtitle" style={{ ...labelStyle, opacity: labelOpacity }}>
              {label}
            </p>
          )}
          {caption && (
            <h2 data-style-role="title" style={{ ...captionStyle, opacity: captionOpacity }}>
              {caption}
            </h2>
          )}
        </div>
      </div>

      {scene?.audio?.file && <Audio src={scene.audio.file} />}
    </AbsoluteFill>
  );
});

Image006.displayName = 'Image006';
export default Image006;
