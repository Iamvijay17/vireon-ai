import React, { useMemo } from 'react';
import { AbsoluteFill, Audio, interpolate, useCurrentFrame, useVideoConfig } from 'remotion';
import { CaptionRenderer } from '../../captions/CaptionRenderer';
import { typography, spacing, palette, mergeStyle, positionStyle } from '../../theme';
import { styles } from './styles';

/**
 * 003-content template ("Timeline" variant of the "content" scene type)
 *
 * Title + a numbered vertical sequence with a connecting line, for
 * step-by-step points or ordered ideas rather than the 001-content
 * variant's unordered bullet list. Same elements shape as every other
 * content variant.
 *
 * Data format: same as "001-content" - { title, items: [{heading?, text}] }.
 */
const Content003 = React.memo(({ scene }) => {
  const frame = useCurrentFrame();
  const { fps, width } = useVideoConfig();
  const elements = scene?.elements || {};
  const overrides = elements.styleConfig || {};
  const scale = width / 1920;

  const title = elements.title || '';
  const bgColor = elements.backgroundColor || palette.clean;
  const caption = elements.caption || '';
  const captionTimestamps = elements.captionTimestamps || null;
  const accentColor = overrides.accentColor;

  const items = useMemo(() => {
    return (elements.items || []).map((item) => ({ heading: item.heading || '', text: item.text || '' }));
  }, [elements.items]);

  const titleStyle = mergeStyle({ ...typography.title, fontSize: 52, textAlign: 'left', marginBottom: spacing.xl, ...positionStyle(overrides.title?.position) }, overrides.title);
  const titleOpacity = interpolate(frame, [0, 20], [0, 1], { extrapolateRight: 'clamp' });
  const titleY = interpolate(frame, [0, 25], [40, 0], { extrapolateRight: 'clamp' });
  const lineScaleY = interpolate(frame, [10, 45], [0, 1], { extrapolateRight: 'clamp' });

  return (
    <AbsoluteFill style={{ backgroundColor: bgColor }}>
      <div style={{ ...styles.background, background: `linear-gradient(135deg, ${bgColor} 0%, #1a1a3e 60%, #0d1117 100%)` }} />

      <div style={{ ...styles.content, transform: `scale(${scale})`, transformOrigin: 'center center', width: `${100 / scale}%`, height: `${100 / scale}%` }}>
        {title && (
          <h1
            data-style-role="title"
            style={{
              ...titleStyle,
              opacity: titleOpacity,
              transform: overrides.title?.position ? titleStyle.transform : `translateY(${titleY}px)`,
            }}
          >
            {title}
          </h1>
        )}

        <div style={styles.timeline}>
          <div
            style={{
              ...styles.timelineLine,
              ...(accentColor ? { background: accentColor } : {}),
              transform: `scaleY(${lineScaleY})`,
              transformOrigin: 'top center',
            }}
          />
          {items.map((item, index) => {
            const rowOpacity = interpolate(frame, [15 + index * 8, 32 + index * 8], [0, 1], { extrapolateRight: 'clamp' });
            const rowX = interpolate(frame, [15 + index * 8, 35 + index * 8], [-20, 0], { extrapolateRight: 'clamp' });
            return (
              <div key={index} style={{ ...styles.row, opacity: rowOpacity, transform: `translateX(${rowX}px)` }}>
                <div style={{ ...styles.marker, ...(accentColor ? { background: accentColor, borderColor: accentColor } : {}) }}>
                  {index + 1}
                </div>
                <div style={styles.rowBody}>
                  {item.heading && <p style={styles.rowHeading}>{item.heading}</p>}
                  {item.text && <p style={styles.rowText}>{item.text}</p>}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <CaptionRenderer
        text={caption}
        animation="fadeInUp"
        animationConfig={{ slideDistance: 15 }}
        styleConfig={{
          position: 'bottom',
          fontFamily: typography.title.fontFamily,
          fontWeight: 500,
          fontSize: 36,
          textColor: '#ffffff',
          backgroundColor: 'rgba(0, 0, 0, 0.4)',
          backgroundPadding: '10px 20px',
          borderRadius: 8,
          framesPerWord: 3,
          maxWidth: '75%',
          ...overrides.captions,
        }}
        timestamps={captionTimestamps}
        fps={fps}
      />

      {scene?.audio?.file && <Audio src={scene.audio.file} />}
    </AbsoluteFill>
  );
});

Content003.displayName = 'Content003';
export default Content003;
