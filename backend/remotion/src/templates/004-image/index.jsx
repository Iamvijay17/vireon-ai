import React from 'react';
import { AbsoluteFill, Audio, Img, interpolate, useCurrentFrame } from 'remotion';
import { backgroundColors } from '../../styles';
import { useFadeIn, useSlideUp } from '../../animations';
import { mergeStyle, positionStyle } from '../../theme';
import { styles } from './styles';

/**
 * 004-image template ("Storytelling" variant of the "image" scene type)
 *
 * A bordered inset frame around the image on a warm parchment-style
 * background, with the caption set in an italic serif "editorial note"
 * style below the frame - different from 003-image's layered-copies
 * texture and 002-image's dark vignette. Same elements shape as
 * "001-image".
 *
 * Data format: same as "001-image" -
 * { image, caption, label, overlayColor? (optional), backgroundColor, styleConfig }.
 */
const Image004 = React.memo(({ scene }) => {
  const frame = useCurrentFrame();
  const elements = scene?.elements || {};
  const image = elements.image || '';
  const caption = elements.caption || '';
  const label = elements.label || '';
  const bgColor = elements.backgroundColor || backgroundColors.clean;
  const overrides = elements.styleConfig || {};

  const frameScale = interpolate(frame, [0, 30], [0.92, 1], { extrapolateRight: 'clamp' });
  const frameFade = useFadeIn({ startAt: 0, duration: 20 });
  const labelFade = useFadeIn({ startAt: 20, duration: 15 });
  const captionSlide = useSlideUp({ startAt: 26, distance: 24 });

  const labelStyle = mergeStyle({ ...styles.label, opacity: labelFade, ...positionStyle(overrides.subtitle?.position) }, overrides.subtitle);
  const captionStyle = mergeStyle({ ...styles.caption, ...captionSlide, ...positionStyle(overrides.title?.position) }, overrides.title);

  return (
    <AbsoluteFill style={{ backgroundColor: bgColor }}>
      <div style={styles.container}>
        <div style={styles.paperTexture} />

        <div style={{ ...styles.frame, opacity: frameFade, transform: `scale(${frameScale})` }}>
          <div style={styles.frameInner}>
            {image ? (
              <Img src={image} style={styles.image} />
            ) : (
              <div style={{ ...styles.image, display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: '#e6dcc2' }}>
                <span style={{ color: '#8a7550', fontSize: 18 }}>No Image</span>
              </div>
            )}
          </div>
        </div>

        <div style={styles.noteWrap}>
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

Image004.displayName = 'Image004';
export default Image004;
