import React from 'react';
import { AbsoluteFill, Audio, Img, interpolate, useCurrentFrame } from 'remotion';
import { backgroundColors } from '../../styles';
import { mergeStyle, positionStyle } from '../../theme';
import { styles } from './styles';

/**
 * 008-title template ("Energetic Diagonal" variant of the "title" scene
 * type)
 *
 * A high-energy composition: bold diagonal color stripes sweep across the
 * background, a chunky angled badge sits above the title, and the title
 * itself is set in condensed, tightly-tracked uppercase type - a gaming/
 * hype-trailer feel distinct from every other title variant's calmer
 * gradients, parallax images, or thin editorial framing. The optional
 * `image` renders as a small angled corner chip. Same elements shape as
 * "001-title".
 *
 * Data format: same as "001-title" -
 * { title, subtitle, image (optional), backgroundColor, styleConfig }.
 */
const Title008 = React.memo(({ scene }) => {
  const frame = useCurrentFrame();
  const elements = scene?.elements || {};
  const title = elements.title || '';
  const subtitle = elements.subtitle || '';
  const image = elements.image || '';
  const bgColor = elements.backgroundColor || backgroundColors.dark;
  const overrides = elements.styleConfig || {};
  const accentColor = overrides.accentColor || '#facc15';

  const stripeX = interpolate(frame, [0, 30], [-200, 0], { extrapolateRight: 'clamp' });
  const badgeScale = interpolate(frame, [4, 20], [0.5, 1], { extrapolateRight: 'clamp' });
  const titleOpacity = interpolate(frame, [12, 28], [0, 1], { extrapolateRight: 'clamp' });
  const titleX = interpolate(frame, [12, 30], [-40, 0], { extrapolateRight: 'clamp' });
  const subtitleOpacity = interpolate(frame, [24, 40], [0, 1], { extrapolateRight: 'clamp' });
  const thumbOpacity = interpolate(frame, [10, 26], [0, 1], { extrapolateRight: 'clamp' });

  const titleStyle = mergeStyle({ ...styles.title, ...positionStyle(overrides.title?.position) }, overrides.title);
  const subtitleStyle = mergeStyle({ ...styles.subtitle, ...positionStyle(overrides.subtitle?.position) }, overrides.subtitle);

  return (
    <AbsoluteFill style={{ backgroundColor: bgColor }}>
      <div style={{ ...styles.stripes, transform: `translateX(${stripeX}px)` }} />
      <div style={styles.dim} />

      {image && (
        <div style={{ ...styles.thumb, opacity: thumbOpacity }}>
          <Img src={image} style={styles.thumbImage} />
        </div>
      )}

      <div style={styles.container}>
        <div style={{ ...styles.badge, background: accentColor, transform: `scale(${badgeScale})` }}>Watch Now</div>

        {title && (
          <h1
            data-style-role="title"
            style={{
              ...titleStyle,
              opacity: overrides.title?.position ? 1 : titleOpacity,
              transform: overrides.title?.position ? titleStyle.transform : `translateX(${titleX}px)`,
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

      {scene?.audio?.file && <Audio src={scene.audio.file} />}
    </AbsoluteFill>
  );
});

Title008.displayName = 'Title008';
export default Title008;
