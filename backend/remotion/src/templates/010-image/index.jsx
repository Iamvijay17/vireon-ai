import React from 'react';
import { AbsoluteFill, Audio, Img, interpolate, useCurrentFrame } from 'remotion';
import { backgroundColors } from '../../styles';
import { mergeStyle, positionStyle } from '../../theme';
import { styles } from './styles';

/**
 * 010-image template ("Kinetic Label" variant of the "image" scene type)
 *
 * Full-bleed image with the caption set in huge, tightly-tracked poster
 * type stamped boldly across the middle of the frame (over a light dark
 * band for contrast) instead of a bottom gradient caption strip - a
 * kinetic-typography editorial poster look distinct from every other
 * image variant. Same elements shape as "001-image".
 *
 * Data format: same as "001-image" -
 * { image, caption, label, overlayColor? (optional), backgroundColor, styleConfig }.
 */
const Image010 = React.memo(({ scene }) => {
  const frame = useCurrentFrame();
  const elements = scene?.elements || {};
  const image = elements.image || '';
  const caption = elements.caption || '';
  const label = elements.label || '';
  const overlayGradient = elements.overlayColor || styles.band.background;
  const bgColor = elements.backgroundColor || backgroundColors.dark;
  const overrides = elements.styleConfig || {};

  const imageZoom = interpolate(frame, [0, 60], [1, 1.08], { extrapolateRight: 'clamp' });
  const bandOpacity = interpolate(frame, [0, 20], [0, 1], { extrapolateRight: 'clamp' });
  const labelOpacity = interpolate(frame, [8, 22], [0, 1], { extrapolateRight: 'clamp' });
  const captionScale = interpolate(frame, [10, 34], [1.3, 1], { extrapolateRight: 'clamp' });
  const captionOpacity = interpolate(frame, [10, 26], [0, 1], { extrapolateRight: 'clamp' });

  const labelStyle = mergeStyle({ ...styles.label, ...positionStyle(overrides.subtitle?.position) }, overrides.subtitle);
  const captionStyle = mergeStyle({ ...styles.caption, ...positionStyle(overrides.title?.position) }, overrides.title);

  return (
    <AbsoluteFill style={{ backgroundColor: bgColor }}>
      <div style={styles.container}>
        {image && <Img src={image} style={{ ...styles.image, transform: `scale(${imageZoom})` }} />}
        <div style={{ ...styles.band, background: overlayGradient, opacity: bandOpacity }} />

        <div style={styles.captionContainer}>
          {label && (
            <p data-style-role="subtitle" style={{ ...labelStyle, opacity: labelOpacity }}>
              {label}
            </p>
          )}
          {caption && (
            <h2 data-style-role="title" style={{ ...captionStyle, opacity: captionOpacity, transform: `scale(${captionScale})` }}>
              {caption}
            </h2>
          )}
        </div>
      </div>

      {scene?.audio?.file && <Audio src={scene.audio.file} />}
    </AbsoluteFill>
  );
});

Image010.displayName = 'Image010';
export default Image010;
