import React from 'react';
import { AbsoluteFill, Audio, Img, interpolate, useCurrentFrame, useVideoConfig } from 'remotion';
import { styles } from './styles';
import { backgroundColors } from '../../styles';
import { mergeStyle, positionStyle, getOrientation } from '../../theme';

/**
 * 009-contentwithimage template ("Corner Accent" variant of the
 * "contentwithimage" scene type)
 *
 * A large image block anchored to the top-right corner with a diagonal
 * clipped edge, a giant faint decorative quote glyph behind the text, and
 * the badge/title/body filling the lower-left - a bold editorial corner
 * composition distinct from 001's even side-by-side split, 004's
 * left-anchored diagonal panel, and every other contentwithimage variant.
 * Same elements shape as "001-contentwithimage".
 *
 * Data format: same as "001-contentwithimage" -
 * { title, body, image, badge, backgroundColor?, styleConfig }.
 */
const ContentWithImage009 = React.memo(({ scene }) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  // The top-right diagonal corner image (52%w/62%h) and bottom-left text
  // panel (58%w/100%h) are two overlapping fixed-fraction blocks tuned for
  // 16:9 - on portrait/square they overlap awkwardly instead of dividing
  // the frame cleanly, so switch to a plain stacked rectangle (image on
  // top, text below, no diagonal) there instead.
  const isLandscape = getOrientation(width, height) === 'landscape';
  const elements = scene?.elements || {};
  const title = elements.title || '';
  const body = elements.body || elements.text || '';
  const image = elements.image || '';
  const badge = elements.badge || elements.label || '';
  const bgColor = elements.backgroundColor || backgroundColors.navy;
  const overrides = elements.styleConfig || {};

  const cornerX = interpolate(frame, [0, 30], [60, 0], { extrapolateRight: 'clamp' });
  const cornerOpacity = interpolate(frame, [0, 20], [0, 1], { extrapolateRight: 'clamp' });
  const badgeOpacity = interpolate(frame, [10, 24], [0, 1], { extrapolateRight: 'clamp' });
  const titleOpacity = interpolate(frame, [16, 32], [0, 1], { extrapolateRight: 'clamp' });
  const titleY = interpolate(frame, [16, 34], [20, 0], { extrapolateRight: 'clamp' });
  const bodyOpacity = interpolate(frame, [24, 40], [0, 1], { extrapolateRight: 'clamp' });

  const titleStyle = mergeStyle({ ...styles.title, ...positionStyle(overrides.title?.position) }, overrides.title);
  const bodyStyle = mergeStyle(styles.body, overrides.body);

  return (
    <AbsoluteFill style={{ backgroundColor: bgColor }}>
      <div style={isLandscape ? styles.container : { ...styles.container, display: 'flex', flexDirection: 'column' }}>
        {isLandscape && <div style={styles.quoteGlyph}>&rdquo;</div>}

        <div
          style={
            isLandscape
              ? { ...styles.corner, opacity: cornerOpacity, transform: `translateX(${cornerX}px)` }
              : { position: 'relative', width: '100%', height: '45%', overflow: 'hidden', opacity: cornerOpacity, transform: `translateY(${cornerX}px)` }
          }
        >
          {image && <Img src={image} style={styles.image} />}
        </div>

        <div
          style={
            isLandscape
              ? styles.textPanel
              : { ...styles.textPanel, width: '100%', height: 'auto', flex: 1, padding: '30px 50px' }
          }
        >
          {badge && <div style={{ ...styles.badge, opacity: badgeOpacity }}>{badge}</div>}
          {title && (
            <h1 data-style-role="title" style={{ ...titleStyle, opacity: titleOpacity, transform: `translateY(${titleY}px)` }}>
              {title}
            </h1>
          )}
          {body && <p style={{ ...bodyStyle, opacity: bodyOpacity }}>{body}</p>}
        </div>
      </div>
      {scene?.audio?.file && <Audio src={scene.audio.file} />}
    </AbsoluteFill>
  );
});

ContentWithImage009.displayName = 'ContentWithImage009';
export default ContentWithImage009;
