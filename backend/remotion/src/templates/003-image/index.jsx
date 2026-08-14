import React from 'react';
import { AbsoluteFill, Audio, Img, interpolate, useCurrentFrame } from 'remotion';
import { backgroundColors } from '../../styles';
import { useFadeIn, useSlideUp, useZoomIn } from '../../animations';
import { mergeStyle, positionStyle } from '../../theme';
import { styles } from './styles';

/**
 * 003-image template ("Layered Frame" variant of the "image" scene type)
 *
 * Collage-style texture built from a single image: a blurred, tinted full
 * bleed copy of the image sits behind an offset "echo" frame and a bordered
 * foreground frame of the same image, giving a layered/multi-frame feel
 * without requiring more than one image URL. Same elements shape as
 * "001-image".
 *
 * Data format: same as "001-image" -
 * { image, caption, label, overlayColor? (optional), backgroundColor, styleConfig }.
 */
const Image003 = React.memo(({ scene }) => {
  const frame = useCurrentFrame();
  const elements = scene?.elements || {};
  const image = elements.image || '';
  const caption = elements.caption || '';
  const label = elements.label || '';
  const overlayGradient = elements.overlayColor || styles.overlay.background;
  const bgColor = elements.backgroundColor || backgroundColors.clean;
  const overrides = elements.styleConfig || {};

  const backdropZoom = useZoomIn({ startAt: 0, duration: 80, from: 1.15, to: 1.25 });
  const echoFade = useFadeIn({ startAt: 6, duration: 20 });
  const frameZoom = interpolate(frame, [0, 60], [1.08, 1], { extrapolateRight: 'clamp' });
  const frameFade = useFadeIn({ startAt: 0, duration: 18 });
  const labelFade = useFadeIn({ startAt: 20, duration: 15 });
  const captionSlide = useSlideUp({ startAt: 24, distance: 40 });

  const labelStyle = mergeStyle({ ...styles.label, opacity: labelFade, ...positionStyle(overrides.subtitle?.position) }, overrides.subtitle);
  const captionStyle = mergeStyle({ ...styles.caption, ...captionSlide, ...positionStyle(overrides.title?.position) }, overrides.title);

  return (
    <AbsoluteFill style={{ backgroundColor: bgColor }}>
      <div style={styles.container}>
        {image && (
          <div style={styles.backdropLayer}>
            <Img src={image} style={{ ...styles.backdropImage, ...backdropZoom }} />
            <div style={styles.backdropTint} />
          </div>
        )}

        {image && (
          <div style={{ ...styles.echoFrame, opacity: echoFade }}>
            <Img src={image} style={styles.frameImage} />
          </div>
        )}

        {image && (
          <div style={{ ...styles.frameWrap, opacity: frameFade, transform: `scale(${frameZoom})` }}>
            <Img src={image} style={styles.frameImage} />
          </div>
        )}

        <div style={{ ...styles.overlay, background: overlayGradient }} />

        <div style={styles.captionContainer}>
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

Image003.displayName = 'Image003';
export default Image003;
