import React from 'react';
import { AbsoluteFill, Audio, Img, interpolate, useCurrentFrame, useVideoConfig } from 'remotion';
import { backgroundColors } from '../../styles';
import { useFadeInOut, useSlideUp } from '../../animations';
import { mergeStyle, positionStyle } from '../../theme';
import { styles } from './styles';

/**
 * 002-image template ("Cinematic Vignette" variant of the "image" scene
 * type)
 *
 * Full-bleed image with a dark radial vignette and an extra darkening
 * layer for a more dramatic, cinematic frame than 001-image's
 * straightforward bottom gradient-overlay caption. Same elements shape as
 * "001-image".
 *
 * Data format: same as "001-image" -
 * { image, caption, label, overlayColor? (optional), backgroundColor, styleConfig }.
 */
const Image002 = React.memo(({ scene }) => {
  const elements = scene?.elements || {};
  const image = elements.image || '';
  const caption = elements.caption || '';
  const label = elements.label || '';
  const overlayGradient = elements.overlayColor || styles.vignette.background;
  const bgColor = elements.backgroundColor || backgroundColors.dark;
  const overrides = elements.styleConfig || {};

  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  const zoomScale = interpolate(frame, [0, durationInFrames || 120], [1, 1.1], { extrapolateRight: 'clamp' });
  const bgFade = useFadeInOut({ fadeIn: 0, fadeInDuration: 15 });
  const lineFade = useFadeInOut({ fadeIn: 10, fadeInDuration: 15 });
  const labelFade = useFadeInOut({ fadeIn: 14, fadeInDuration: 15 });
  const captionSlide = useSlideUp({ startAt: 18, distance: 40 });

  const labelStyle = mergeStyle({ ...styles.label, opacity: labelFade, ...positionStyle(overrides.subtitle?.position) }, overrides.subtitle);
  const captionStyle = mergeStyle({ ...styles.caption, ...captionSlide, ...positionStyle(overrides.title?.position) }, overrides.title);

  return (
    <AbsoluteFill style={{ backgroundColor: bgColor }}>
      <div style={styles.container}>
        {image ? (
          <Img src={image} style={{ ...styles.image, transform: `scale(${zoomScale})` }} />
        ) : (
          <div style={{ ...styles.image, backgroundColor: 'rgba(255,255,255,0.05)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <span style={{ color: 'rgba(255,255,255,0.3)', fontSize: 18 }}>No Image</span>
          </div>
        )}
        <div style={styles.darken} />
        <div style={{ ...styles.vignette, background: overlayGradient, opacity: bgFade }} />

        <div style={styles.content}>
          <div style={{ ...styles.accentLine, opacity: lineFade }} />
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

      {scene?.audio?.file && <Audio src={scene.audio.file} />}
    </AbsoluteFill>
  );
});

Image002.displayName = 'Image002';
export default Image002;
