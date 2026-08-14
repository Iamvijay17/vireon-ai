import React from 'react';
import { AbsoluteFill, Audio, Img, interpolate, useCurrentFrame } from 'remotion';
import { backgroundColors } from '../../styles';
import { mergeStyle, positionStyle } from '../../theme';
import { styles } from './styles';

/**
 * 006-title template ("Split Screen" variant of the "title" scene type)
 *
 * A hard vertical split: the image fills the left half of the frame and
 * the title/subtitle sit in a solid-color right half - a two-block
 * geometric composition, distinct from 001's centered hero,
 * 002's full-bleed parallax, 003's centered minimal, 004's bold left
 * hero over a full background, and 005's framed editorial cover. Falls
 * back to a plain color panel on the left when no image is provided. Same
 * elements shape as "001-title".
 *
 * Data format: same as "001-title" -
 * { title, subtitle, image (optional), backgroundColor, styleConfig }.
 */
const Title006 = React.memo(({ scene }) => {
  const frame = useCurrentFrame();
  const elements = scene?.elements || {};
  const title = elements.title || '';
  const subtitle = elements.subtitle || '';
  const image = elements.image || '';
  const bgColor = elements.backgroundColor || backgroundColors.navy;
  const overrides = elements.styleConfig || {};

  const imageScale = interpolate(frame, [0, 45], [1.12, 1], { extrapolateRight: 'clamp' });
  const panelX = interpolate(frame, [4, 26], [50, 0], { extrapolateRight: 'clamp' });
  const titleOpacity = interpolate(frame, [14, 32], [0, 1], { extrapolateRight: 'clamp' });
  const titleY = interpolate(frame, [14, 34], [24, 0], { extrapolateRight: 'clamp' });
  const subtitleOpacity = interpolate(frame, [24, 42], [0, 1], { extrapolateRight: 'clamp' });

  const titleStyle = mergeStyle({ ...styles.title, ...positionStyle(overrides.title?.position) }, overrides.title);
  const subtitleStyle = mergeStyle({ ...styles.subtitle, ...positionStyle(overrides.subtitle?.position) }, overrides.subtitle);

  return (
    <AbsoluteFill style={{ backgroundColor: bgColor }}>
      <div style={styles.container}>
        <div style={styles.imageHalf}>
          {image ? (
            <Img src={image} style={{ ...styles.image, transform: `scale(${imageScale})` }} />
          ) : (
            <div style={{ ...styles.image, background: `linear-gradient(160deg, ${bgColor} 0%, #0d1117 100%)` }} />
          )}
        </div>

        <div style={{ ...styles.textHalf, opacity: interpolate(frame, [0, 20], [0, 1], { extrapolateRight: 'clamp' }), transform: `translateX(${panelX}px)` }}>
          {title && (
            <h1
              data-style-role="title"
              style={{
                ...titleStyle,
                opacity: overrides.title?.position ? 1 : titleOpacity,
                transform: overrides.title?.position ? titleStyle.transform : `translateY(${titleY}px)`,
              }}
            >
              {title}
            </h1>
          )}
          {subtitle && (
            <p
              data-style-role="subtitle"
              style={{
                ...subtitleStyle,
                opacity: overrides.subtitle?.position ? 1 : subtitleOpacity,
              }}
            >
              {subtitle}
            </p>
          )}
        </div>
      </div>

      {scene?.audio?.file && <Audio src={scene.audio.file} />}
    </AbsoluteFill>
  );
});

Title006.displayName = 'Title006';
export default Title006;
