import React from 'react';
import { AbsoluteFill, Audio, Img, interpolate, useCurrentFrame } from 'remotion';
import { styles } from './styles';
import { backgroundColors } from '../../styles';
import { mergeStyle, positionStyle } from '../../theme';

/**
 * 005-contentwithimage template ("Top-Bottom Split" variant of the
 * "contentwithimage" scene type)
 *
 * A horizontal band split: the image fills the top half of the frame, and
 * the badge/title/body text panel fills the bottom half - a vertical
 * stacking, distinct from 001's side-by-side split, 002's badge-on-image
 * card, 003's full-bleed cinematic scrim, and 004's diagonal split reveal.
 * Same elements shape as "001-contentwithimage".
 *
 * Data format: same as "001-contentwithimage" -
 * { title, body, image, badge, backgroundColor?, styleConfig }.
 */
const ContentWithImage005 = React.memo(({ scene }) => {
  const frame = useCurrentFrame();
  const elements = scene?.elements || {};
  const title = elements.title || '';
  const body = elements.body || elements.text || '';
  const image = elements.image || '';
  const badge = elements.badge || elements.label || '';
  const bgColor = elements.backgroundColor || backgroundColors.navy;
  const overrides = elements.styleConfig || {};

  const imageScale = interpolate(frame, [0, 40], [1.12, 1], { extrapolateRight: 'clamp' });
  const panelY = interpolate(frame, [4, 26], [30, 0], { extrapolateRight: 'clamp' });
  const panelOpacity = interpolate(frame, [4, 22], [0, 1], { extrapolateRight: 'clamp' });
  const badgeOpacity = interpolate(frame, [12, 26], [0, 1], { extrapolateRight: 'clamp' });

  const titleStyle = mergeStyle({ ...styles.title, ...positionStyle(overrides.title?.position) }, overrides.title);
  const bodyStyle = mergeStyle(styles.body, overrides.body);

  return (
    <AbsoluteFill style={{ backgroundColor: bgColor }}>
      <div style={styles.container}>
        <div style={styles.imageBand}>
          {image && <Img src={image} style={{ ...styles.image, transform: `scale(${imageScale})` }} />}
          <div style={styles.imageFade} />
        </div>
        <div style={{ ...styles.textPanel, opacity: panelOpacity, transform: `translateY(${panelY}px)` }}>
          {badge && <div style={{ ...styles.badge, opacity: badgeOpacity }}>{badge}</div>}
          {title && <h1 data-style-role="title" style={titleStyle}>{title}</h1>}
          {body && <p style={bodyStyle}>{body}</p>}
        </div>
      </div>
      {scene?.audio?.file && <Audio src={scene.audio.file} />}
    </AbsoluteFill>
  );
});

ContentWithImage005.displayName = 'ContentWithImage005';
export default ContentWithImage005;
