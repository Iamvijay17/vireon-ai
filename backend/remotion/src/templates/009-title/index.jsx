import React from 'react';
import { AbsoluteFill, Audio, Img, interpolate, useCurrentFrame } from 'remotion';
import { backgroundColors } from '../../styles';
import { mergeStyle, positionStyle } from '../../theme';
import { styles } from './styles';

/**
 * 009-title template ("Duotone Split" variant of the "title" scene type)
 *
 * The background is a diagonal two-color block split (accent color top-
 * left, dark bottom-right) with the title straddling the seam and a small
 * circular image badge floating near the divider - a duotone color-
 * blocking composition distinct from every other title variant. Same
 * elements shape as "001-title".
 *
 * Data format: same as "001-title" -
 * { title, subtitle, image (optional), backgroundColor, styleConfig }.
 */
const Title009 = React.memo(({ scene }) => {
  const frame = useCurrentFrame();
  const elements = scene?.elements || {};
  const title = elements.title || '';
  const subtitle = elements.subtitle || '';
  const image = elements.image || '';
  const bgColor = elements.backgroundColor || backgroundColors.dark;
  const overrides = elements.styleConfig || {};
  const accentColor = overrides.accentColor || '#14b8a6';

  const blockOpacity = interpolate(frame, [0, 20], [0, 1], { extrapolateRight: 'clamp' });
  const titleOpacity = interpolate(frame, [10, 28], [0, 1], { extrapolateRight: 'clamp' });
  const titleY = interpolate(frame, [10, 30], [26, 0], { extrapolateRight: 'clamp' });
  const subtitleOpacity = interpolate(frame, [22, 38], [0, 1], { extrapolateRight: 'clamp' });
  const badgeScale = interpolate(frame, [14, 30], [0.5, 1], { extrapolateRight: 'clamp' });

  const titleStyle = mergeStyle({ ...styles.title, ...positionStyle(overrides.title?.position) }, overrides.title);
  const subtitleStyle = mergeStyle({ ...styles.subtitle, ...positionStyle(overrides.subtitle?.position) }, overrides.subtitle);

  return (
    <AbsoluteFill style={{ backgroundColor: bgColor }}>
      <div style={{ ...styles.colorBlock, background: accentColor, opacity: blockOpacity }} />
      <div style={styles.darkBlock} />

      {image && (
        <div style={{ ...styles.badge, transform: `scale(${badgeScale})` }}>
          <Img src={image} style={styles.badgeImage} />
        </div>
      )}

      <div style={styles.container}>
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

      {scene?.audio?.file && <Audio src={scene.audio.file} />}
    </AbsoluteFill>
  );
});

Title009.displayName = 'Title009';
export default Title009;
