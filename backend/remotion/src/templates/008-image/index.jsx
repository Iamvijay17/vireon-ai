import React from 'react';
import { AbsoluteFill, Audio, Img, interpolate, useCurrentFrame } from 'remotion';
import { backgroundColors } from '../../styles';
import { mergeStyle, positionStyle } from '../../theme';
import { styles } from './styles';

/**
 * 008-image template ("Bordered Grid Frame" variant of the "image" scene
 * type)
 *
 * A single thick accent-colored border frames the image like a museum
 * placard, with the label/caption set below the frame (outside the
 * image) rather than overlaid on top of it - distinct from 003's layered
 * multi-copy collage and 004's parchment inset frame (both keep text over
 * or beside the image, and both use soft borders). Same elements shape as
 * "001-image".
 *
 * Data format: same as "001-image" -
 * { image, caption, label, overlayColor? (optional), backgroundColor, styleConfig }.
 */
const Image008 = React.memo(({ scene }) => {
  const frame = useCurrentFrame();
  const elements = scene?.elements || {};
  const image = elements.image || '';
  const caption = elements.caption || '';
  const label = elements.label || '';
  const bgColor = elements.backgroundColor || backgroundColors.clean;
  const overrides = elements.styleConfig || {};
  const accentColor = overrides.accentColor || '#60a5fa';

  const frameScale = interpolate(frame, [0, 26], [0.94, 1], { extrapolateRight: 'clamp' });
  const frameOpacity = interpolate(frame, [0, 20], [0, 1], { extrapolateRight: 'clamp' });
  const labelOpacity = interpolate(frame, [20, 34], [0, 1], { extrapolateRight: 'clamp' });
  const captionOpacity = interpolate(frame, [26, 42], [0, 1], { extrapolateRight: 'clamp' });

  const labelStyle = mergeStyle({ ...styles.label, ...positionStyle(overrides.subtitle?.position) }, overrides.subtitle);
  const captionStyle = mergeStyle({ ...styles.caption, ...positionStyle(overrides.title?.position) }, overrides.title);

  return (
    <AbsoluteFill style={{ backgroundColor: bgColor }}>
      <div style={styles.container}>
        <div style={{ ...styles.frame, borderColor: accentColor, opacity: frameOpacity, transform: `scale(${frameScale})` }}>
          {image ? (
            <Img src={image} style={styles.image} />
          ) : (
            <div style={{ ...styles.image, display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: '#1e293b' }}>
              <span style={{ color: 'rgba(255,255,255,0.3)', fontSize: 16 }}>No Image</span>
            </div>
          )}
        </div>

        <div style={styles.plaque}>
          {label && (
            <p data-style-role="subtitle" style={{ ...labelStyle, opacity: labelOpacity, color: accentColor }}>
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

Image008.displayName = 'Image008';
export default Image008;
