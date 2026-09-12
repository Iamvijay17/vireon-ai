import React from 'react';
import { AbsoluteFill, Audio, Img, interpolate, useCurrentFrame, useVideoConfig } from 'remotion';
import { styles } from './styles';
import { backgroundColors } from '../../styles';
import { mergeStyle, positionStyle, getOrientation } from '../../theme';

/**
 * 006-contentwithimage template ("Framed Inset" variant of the
 * "contentwithimage" scene type)
 *
 * The image sits as a small bordered, drop-shadowed inset frame on the
 * left over a solid background (not full-bleed), with generous whitespace
 * and the badge/title/body text filling the right side - an editorial,
 * gallery-plaque feel distinct from every other contentwithimage variant's
 * full-bleed or edge-to-edge image treatment. Same elements shape as
 * "001-contentwithimage".
 *
 * Data format: same as "001-contentwithimage" -
 * { title, body, image, badge, backgroundColor?, styleConfig }.
 */
const ContentWithImage006 = React.memo(({ scene }) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  // The fixed 460x460 frame + side-by-side text panel squeezes on
  // portrait/square - stack frame-on-top-of-text instead, with the frame
  // sized as a percentage instead of a fixed px box.
  const isLandscape = getOrientation(width, height) === 'landscape';
  const elements = scene?.elements || {};
  const title = elements.title || '';
  const body = elements.body || elements.text || '';
  const image = elements.image || '';
  const badge = elements.badge || elements.label || '';
  const bgColor = elements.backgroundColor || backgroundColors.clean;
  const overrides = elements.styleConfig || {};

  const frameScale = interpolate(frame, [0, 26], [0.9, 1], { extrapolateRight: 'clamp' });
  const frameOpacity = interpolate(frame, [0, 20], [0, 1], { extrapolateRight: 'clamp' });
  const badgeOpacity = interpolate(frame, [14, 28], [0, 1], { extrapolateRight: 'clamp' });
  const titleOpacity = interpolate(frame, [18, 34], [0, 1], { extrapolateRight: 'clamp' });
  const titleY = interpolate(frame, [18, 36], [16, 0], { extrapolateRight: 'clamp' });
  const bodyOpacity = interpolate(frame, [26, 42], [0, 1], { extrapolateRight: 'clamp' });

  const titleStyle = mergeStyle({ ...styles.title, ...positionStyle(overrides.title?.position) }, overrides.title);
  const bodyStyle = mergeStyle(styles.body, overrides.body);

  return (
    <AbsoluteFill style={{ backgroundColor: bgColor }}>
      <div style={isLandscape ? styles.container : { ...styles.container, flexDirection: 'column', padding: '40px 50px', gap: 30 }}>
        <div
          style={{
            ...styles.frameWrap,
            ...(isLandscape ? {} : { width: '60%', height: 'auto', aspectRatio: '1 / 1' }),
            opacity: frameOpacity,
            transform: `scale(${frameScale})`,
          }}
        >
          <div style={styles.frame}>
            {image ? (
              <Img src={image} style={styles.image} />
            ) : (
              <div style={{ ...styles.image, display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: '#1e293b' }}>
                <span style={{ color: 'rgba(255,255,255,0.3)', fontSize: 16 }}>No Image</span>
              </div>
            )}
          </div>
        </div>

        <div style={isLandscape ? styles.textPanel : { ...styles.textPanel, alignItems: 'center', textAlign: 'center' }}>
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

ContentWithImage006.displayName = 'ContentWithImage006';
export default ContentWithImage006;
