import React from 'react';
import { AbsoluteFill, Audio, Img, interpolate, useCurrentFrame } from 'remotion';
import { backgroundColors } from '../../styles';
import { mergeStyle, positionStyle } from '../../theme';
import { styles } from './styles';

/**
 * 007-image template ("Duotone Wash" variant of the "image" scene type)
 *
 * A strong solid-color duotone gradient wash over the full-bleed image
 * (rather than a dark vignette or gradient-to-black), with the caption
 * centered in the middle of the frame - a bold color-blocking editorial
 * poster look distinct from 001-005. `overlayColor` (if provided) replaces
 * the default duotone gradient, matching 001-image's optional-overlay
 * behavior. Same elements shape as "001-image".
 *
 * Data format: same as "001-image" -
 * { image, caption, label, overlayColor? (optional), backgroundColor, styleConfig }.
 */
const Image007 = React.memo(({ scene }) => {
  const frame = useCurrentFrame();
  const elements = scene?.elements || {};
  const image = elements.image || '';
  const caption = elements.caption || '';
  const label = elements.label || '';
  const bgColor = elements.backgroundColor || backgroundColors.dark;
  const overrides = elements.styleConfig || {};
  const accentColor = overrides.accentColor || '#0891b2';
  const overlayGradient = elements.overlayColor || `linear-gradient(160deg, ${accentColor}cc 0%, #0d1117cc 100%)`;

  const imageZoom = interpolate(frame, [0, 55], [1.1, 1], { extrapolateRight: 'clamp' });
  const washOpacity = interpolate(frame, [0, 22], [0, 1], { extrapolateRight: 'clamp' });
  const labelOpacity = interpolate(frame, [16, 30], [0, 1], { extrapolateRight: 'clamp' });
  const captionOpacity = interpolate(frame, [22, 40], [0, 1], { extrapolateRight: 'clamp' });
  const captionScale = interpolate(frame, [22, 44], [0.95, 1], { extrapolateRight: 'clamp' });

  const labelStyle = mergeStyle({ ...styles.label, ...positionStyle(overrides.subtitle?.position) }, overrides.subtitle);
  const captionStyle = mergeStyle({ ...styles.caption, ...positionStyle(overrides.title?.position) }, overrides.title);

  return (
    <AbsoluteFill style={{ backgroundColor: bgColor }}>
      <div style={styles.container}>
        {image && <Img src={image} style={{ ...styles.image, transform: `scale(${imageZoom})` }} />}
        <div style={{ ...styles.wash, background: overlayGradient, opacity: washOpacity }} />

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

Image007.displayName = 'Image007';
export default Image007;
