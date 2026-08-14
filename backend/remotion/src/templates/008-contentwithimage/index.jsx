import React from 'react';
import { AbsoluteFill, Audio, Img, interpolate, useCurrentFrame } from 'remotion';
import { styles } from './styles';
import { backgroundColors } from '../../styles';
import { mergeStyle, positionStyle } from '../../theme';

/**
 * 008-contentwithimage template ("Circle Frame" variant of the
 * "contentwithimage" scene type)
 *
 * A circular cropped image badge centered above the badge/title/body text
 * (a profile-card / avatar-forward composition) rather than a rectangular
 * side panel or full-bleed background - distinct from every other
 * contentwithimage variant, none of which crop the image into a circle.
 * Same elements shape as "001-contentwithimage".
 *
 * Data format: same as "001-contentwithimage" -
 * { title, body, image, badge, backgroundColor?, styleConfig }.
 */
const ContentWithImage008 = React.memo(({ scene }) => {
  const frame = useCurrentFrame();
  const elements = scene?.elements || {};
  const title = elements.title || '';
  const body = elements.body || elements.text || '';
  const image = elements.image || '';
  const badge = elements.badge || elements.label || '';
  const bgColor = elements.backgroundColor || backgroundColors.clean;
  const overrides = elements.styleConfig || {};

  const circleScale = interpolate(frame, [0, 24], [0.6, 1], { extrapolateRight: 'clamp' });
  const circleOpacity = interpolate(frame, [0, 18], [0, 1], { extrapolateRight: 'clamp' });
  const badgeOpacity = interpolate(frame, [16, 30], [0, 1], { extrapolateRight: 'clamp' });
  const titleOpacity = interpolate(frame, [20, 36], [0, 1], { extrapolateRight: 'clamp' });
  const titleY = interpolate(frame, [20, 38], [16, 0], { extrapolateRight: 'clamp' });
  const bodyOpacity = interpolate(frame, [28, 44], [0, 1], { extrapolateRight: 'clamp' });

  const titleStyle = mergeStyle({ ...styles.title, ...positionStyle(overrides.title?.position) }, overrides.title);
  const bodyStyle = mergeStyle(styles.body, overrides.body);

  return (
    <AbsoluteFill style={{ backgroundColor: bgColor }}>
      <div style={styles.container}>
        <div style={{ ...styles.circleWrap, opacity: circleOpacity, transform: `scale(${circleScale})` }}>
          {image ? (
            <Img src={image} style={styles.image} />
          ) : (
            <div style={{ ...styles.image, display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: '#1e293b' }}>
              <span style={{ color: 'rgba(255,255,255,0.3)', fontSize: 14 }}>No Image</span>
            </div>
          )}
        </div>

        {badge && <div style={{ ...styles.badge, opacity: badgeOpacity }}>{badge}</div>}
        {title && (
          <h1 data-style-role="title" style={{ ...titleStyle, opacity: titleOpacity, transform: `translateY(${titleY}px)` }}>
            {title}
          </h1>
        )}
        {body && <p style={{ ...bodyStyle, opacity: bodyOpacity }}>{body}</p>}
      </div>
      {scene?.audio?.file && <Audio src={scene.audio.file} />}
    </AbsoluteFill>
  );
});

ContentWithImage008.displayName = 'ContentWithImage008';
export default ContentWithImage008;
