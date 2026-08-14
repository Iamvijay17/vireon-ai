import React from 'react';
import { AbsoluteFill, Audio, Img, interpolate, useCurrentFrame } from 'remotion';
import { backgroundColors } from '../../styles';
import { mergeStyle, positionStyle } from '../../theme';
import { styles } from './styles';

/**
 * 005-title template ("Report Summary" variant of the "title" scene type)
 *
 * Clean "report cover" style: a thin outer frame, a small accent rule and
 * an uppercase kicker label above the title, generous whitespace, and a
 * left-aligned editorial layout - a structured, document-like feel,
 * distinct from 001-title (gradient hero), 002-title (parallax image),
 * 003-title (centered minimal), and 004-title (bold hero). The `subtitle`
 * field renders as the cover's descriptive line below a divider; the
 * kicker label is static chrome, not a new data field. Optional `image`
 * renders as a small bordered cover thumbnail on the right. Same elements
 * shape as "001-title".
 *
 * Data format: same as "001-title" -
 * { title, subtitle, image (optional), backgroundColor, styleConfig }.
 */
const Title005 = React.memo(({ scene }) => {
  const frame = useCurrentFrame();
  const elements = scene?.elements || {};
  const title = elements.title || '';
  const subtitle = elements.subtitle || '';
  const image = elements.image || '';
  const bgColor = elements.backgroundColor || backgroundColors.clean;
  const overrides = elements.styleConfig || {};

  const ruleScale = interpolate(frame, [0, 18], [0, 1], { extrapolateRight: 'clamp' });
  const titleOpacity = interpolate(frame, [6, 26], [0, 1], { extrapolateRight: 'clamp' });
  const titleY = interpolate(frame, [6, 30], [24, 0], { extrapolateRight: 'clamp' });
  const dividerScale = interpolate(frame, [22, 36], [0, 1], { extrapolateRight: 'clamp' });
  const subtitleOpacity = interpolate(frame, [30, 48], [0, 1], { extrapolateRight: 'clamp' });
  const thumbOpacity = interpolate(frame, [10, 30], [0, 1], { extrapolateRight: 'clamp' });
  const frameOpacity = interpolate(frame, [0, 20], [0, 1], { extrapolateRight: 'clamp' });

  const titleStyle = mergeStyle({ ...styles.title, ...positionStyle(overrides.title?.position) }, overrides.title);
  const subtitleStyle = mergeStyle({ ...styles.subtitle, ...positionStyle(overrides.subtitle?.position) }, overrides.subtitle);

  return (
    <AbsoluteFill style={{ backgroundColor: bgColor }}>
      <div style={styles.outer}>
        <div style={{ ...styles.frame, opacity: frameOpacity }}>
          <div style={{ ...styles.ruleTop, transform: `scaleX(${ruleScale})`, transformOrigin: 'left center' }} />

          {image && (
            <div style={{ ...styles.thumb, opacity: thumbOpacity }}>
              <Img src={image} style={styles.thumbImage} />
            </div>
          )}

          <p style={{ ...styles.kicker, opacity: ruleScale }}>Report</p>

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
            <>
              <div style={{ ...styles.divider, transform: `scaleX(${dividerScale})`, transformOrigin: 'left center' }} />
              <p
                data-style-role="subtitle"
                style={{
                  ...subtitleStyle,
                  opacity: overrides.subtitle?.position ? 1 : subtitleOpacity,
                }}
              >
                {subtitle}
              </p>
            </>
          )}

          <div style={styles.ruleBottom} />
        </div>
      </div>

      {scene?.audio?.file && <Audio src={scene.audio.file} />}
    </AbsoluteFill>
  );
});

Title005.displayName = 'Title005';
export default Title005;
