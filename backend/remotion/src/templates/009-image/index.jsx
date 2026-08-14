import React from 'react';
import { AbsoluteFill, Audio, Img, interpolate, useCurrentFrame } from 'remotion';
import { backgroundColors } from '../../styles';
import { mergeStyle, positionStyle } from '../../theme';
import { styles } from './styles';

/**
 * 009-image template ("Split Color Block" variant of the "image" scene
 * type)
 *
 * The image only fills the left half of the frame; the right half is a
 * solid accent color block carrying the label/caption - a geometric split
 * composition where the image does NOT fill the whole frame, distinct
 * from every other image variant (001, 002, 006, 007, 009 all go
 * full-bleed; 003/004/005 inset a smaller frame but keep image+text
 * overlapping, not side-by-side blocks). Same elements shape as
 * "001-image".
 *
 * Data format: same as "001-image" -
 * { image, caption, label, overlayColor? (optional), backgroundColor, styleConfig }.
 */
const Image009 = React.memo(({ scene }) => {
  const frame = useCurrentFrame();
  const elements = scene?.elements || {};
  const image = elements.image || '';
  const caption = elements.caption || '';
  const label = elements.label || '';
  const bgColor = elements.backgroundColor || backgroundColors.clean;
  const overrides = elements.styleConfig || {};
  const accentColor = overrides.accentColor || '#ec4899';

  const imageScale = interpolate(frame, [0, 40], [1.1, 1], { extrapolateRight: 'clamp' });
  const blockX = interpolate(frame, [4, 26], [40, 0], { extrapolateRight: 'clamp' });
  const blockOpacity = interpolate(frame, [4, 22], [0, 1], { extrapolateRight: 'clamp' });
  const labelOpacity = interpolate(frame, [18, 32], [0, 1], { extrapolateRight: 'clamp' });
  const captionOpacity = interpolate(frame, [24, 40], [0, 1], { extrapolateRight: 'clamp' });

  const labelStyle = mergeStyle({ ...styles.label, ...positionStyle(overrides.subtitle?.position) }, overrides.subtitle);
  const captionStyle = mergeStyle({ ...styles.caption, ...positionStyle(overrides.title?.position) }, overrides.title);

  return (
    <AbsoluteFill style={{ backgroundColor: bgColor }}>
      <div style={styles.container}>
        <div style={styles.imageHalf}>
          {image ? (
            <Img src={image} style={{ ...styles.image, transform: `scale(${imageScale})` }} />
          ) : (
            <div style={{ ...styles.image, display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: '#111827' }}>
              <span style={{ color: 'rgba(255,255,255,0.3)', fontSize: 16 }}>No Image</span>
            </div>
          )}
        </div>

        <div style={{ ...styles.colorHalf, backgroundColor: accentColor, opacity: blockOpacity, transform: `translateX(${blockX}px)` }}>
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

Image009.displayName = 'Image009';
export default Image009;
