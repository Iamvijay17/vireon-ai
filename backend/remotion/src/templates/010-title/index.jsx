import React from 'react';
import { AbsoluteFill, Audio, Img, interpolate, useCurrentFrame } from 'remotion';
import { backgroundColors } from '../../styles';
import { mergeStyle, positionStyle } from '../../theme';
import { styles } from './styles';

/**
 * 010-title template ("Framed Poster" variant of the "title" scene type)
 *
 * A full bordered poster layout: the optional image fills a large square
 * art area at the top inside a thin outer frame, with the title/subtitle
 * centered below it, both within the same border - a graphic, movie-
 * poster feel where the image dominates the composition, distinct from
 * 005-title's text-forward editorial cover (small corner thumbnail) and
 * every other title variant. Same elements shape as "001-title".
 *
 * Data format: same as "001-title" -
 * { title, subtitle, image (optional), backgroundColor, styleConfig }.
 */
const Title010 = React.memo(({ scene }) => {
  const frame = useCurrentFrame();
  const elements = scene?.elements || {};
  const title = elements.title || '';
  const subtitle = elements.subtitle || '';
  const image = elements.image || '';
  const bgColor = elements.backgroundColor || backgroundColors.clean;
  const overrides = elements.styleConfig || {};

  const frameOpacity = interpolate(frame, [0, 20], [0, 1], { extrapolateRight: 'clamp' });
  const artScale = interpolate(frame, [4, 30], [0.92, 1], { extrapolateRight: 'clamp' });
  const titleOpacity = interpolate(frame, [22, 40], [0, 1], { extrapolateRight: 'clamp' });
  const titleY = interpolate(frame, [22, 42], [18, 0], { extrapolateRight: 'clamp' });
  const subtitleOpacity = interpolate(frame, [32, 48], [0, 1], { extrapolateRight: 'clamp' });

  const titleStyle = mergeStyle({ ...styles.title, ...positionStyle(overrides.title?.position) }, overrides.title);
  const subtitleStyle = mergeStyle({ ...styles.subtitle, ...positionStyle(overrides.subtitle?.position) }, overrides.subtitle);

  return (
    <AbsoluteFill style={{ backgroundColor: bgColor }}>
      <div style={styles.outer}>
        <div style={{ ...styles.frame, opacity: frameOpacity }}>
          <div style={{ ...styles.artArea, transform: `scale(${artScale})` }}>
            {image ? (
              <Img src={image} style={styles.artImage} />
            ) : (
              <div style={{ ...styles.artImage, background: 'linear-gradient(160deg, #1a1a3e 0%, #0d1117 100%)' }} />
            )}
          </div>

          <div style={styles.textBlock}>
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
      </div>

      {scene?.audio?.file && <Audio src={scene.audio.file} />}
    </AbsoluteFill>
  );
});

Title010.displayName = 'Title010';
export default Title010;
