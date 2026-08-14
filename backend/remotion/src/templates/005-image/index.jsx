import React from 'react';
import { AbsoluteFill, Audio, Img, interpolate, useCurrentFrame } from 'remotion';
import { backgroundColors } from '../../styles';
import { useFadeIn } from '../../animations';
import { mergeStyle, positionStyle } from '../../theme';
import { styles } from './styles';

/**
 * 005-image template ("Polaroid" variant of the "image" scene type)
 *
 * The single image rendered inside a white-bordered polaroid-style card
 * (thick bottom border acting as the caption strip, slight rotation for a
 * candid feel) over a soft blurred backdrop copy of the same image -
 * distinct from all other image variants (001 full-bleed, 002 vignette,
 * 003 layered frame, 004 parchment frame). Uses only the single `image`
 * field, no collage of multiple images. Same elements shape as
 * "001-image".
 *
 * Data format: same as "001-image" -
 * { image, caption, label, overlayColor? (optional), backgroundColor, styleConfig }.
 */
const Image005 = React.memo(({ scene }) => {
  const frame = useCurrentFrame();
  const elements = scene?.elements || {};
  const image = elements.image || '';
  const caption = elements.caption || '';
  const label = elements.label || '';
  const bgColor = elements.backgroundColor || backgroundColors.dark;
  const overrides = elements.styleConfig || {};

  const rotation = -4;
  const cardRotate = interpolate(frame, [0, 24], [rotation - 6, rotation], { extrapolateRight: 'clamp' });
  const cardScale = interpolate(frame, [0, 24], [0.85, 1], { extrapolateRight: 'clamp' });
  const cardFade = useFadeIn({ startAt: 0, duration: 18 });
  const stripFade = useFadeIn({ startAt: 20, duration: 15 });

  const labelStyle = mergeStyle({ ...styles.label, ...positionStyle(overrides.subtitle?.position) }, overrides.subtitle);
  const captionStyle = mergeStyle({ ...styles.caption, ...positionStyle(overrides.title?.position) }, overrides.title);

  return (
    <AbsoluteFill style={{ backgroundColor: bgColor }}>
      <div style={styles.container}>
        {image && (
          <Img
            src={image}
            style={{ ...styles.backdrop, width: '100%', height: '100%', objectFit: 'cover', filter: 'blur(30px) brightness(0.5)', transform: 'scale(1.2)' }}
          />
        )}

        <div style={{ ...styles.card, opacity: cardFade, transform: `rotate(${cardRotate}deg) scale(${cardScale})` }}>
          <div style={styles.photo}>
            {image ? (
              <Img src={image} style={styles.image} />
            ) : (
              <div style={{ ...styles.image, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: 16 }}>No Image</span>
              </div>
            )}
          </div>

          <div style={{ ...styles.strip, opacity: stripFade }}>
            {label && (
              <p data-style-role="subtitle" style={labelStyle}>
                {label}
              </p>
            )}
            {caption && (
              <h2 data-style-role="title" style={captionStyle}>
                {caption}
              </h2>
            )}
          </div>
        </div>
      </div>

      {scene?.audio?.file && <Audio src={scene.audio.file} />}
    </AbsoluteFill>
  );
});

Image005.displayName = 'Image005';
export default Image005;
