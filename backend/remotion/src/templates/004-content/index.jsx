import React, { useMemo } from 'react';
import { AbsoluteFill, Audio, interpolate, useCurrentFrame, useVideoConfig } from 'remotion';
import { CaptionRenderer } from '../../captions/CaptionRenderer';
import { typography, spacing, palette, mergeStyle, positionStyle } from '../../theme';
import { styles } from './styles';

/**
 * 004-content template ("Checklist" variant of the "content" scene type)
 *
 * Title + a vertical list of rows, each marked with a checkmark badge
 * instead of the 001-content variant's plain accent dot - good for
 * to-do/completed-step framing. Same elements shape as every other
 * content variant.
 *
 * Data format: same as "001-content" - { title, items: [{heading?, text}] }.
 */
const Content004 = React.memo(({ scene }) => {
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

  const titleStyle = mergeStyle({ ...typography.title, fontSize: 56, textAlign: 'left', marginBottom: 16, ...positionStyle(overrides.title?.position) }, overrides.title);
  const rowTextStyle = mergeStyle(typography.body, overrides.body);
  const rowHeadingStyle = mergeStyle(
    { ...typography.body, fontWeight: 600, color: palette.textOnDark, marginRight: 8 },
    overrides.heading
  );

  const titleOpacity = interpolate(frame, [0, 20], [0, 1], { extrapolateRight: 'clamp' });
  const titleY = interpolate(frame, [0, 25], [40, 0], { extrapolateRight: 'clamp' });
  const lineScaleX = interpolate(frame, [5, 20], [0, 1], { extrapolateRight: 'clamp' });

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

        <div
          style={{
            ...styles.accentLine,
            ...(accentColor ? { background: accentColor } : {}),
            transform: `scaleX(${lineScaleX})`,
            transformOrigin: 'left center',
            opacity: titleOpacity,
          }}
        />

        <div style={styles.list}>
          {items.map((item, index) => {
            const rowOpacity = interpolate(frame, [15 + index * 6, 30 + index * 6], [0, 1], { extrapolateRight: 'clamp' });
            const rowX = interpolate(frame, [15 + index * 6, 35 + index * 6], [-20, 0], { extrapolateRight: 'clamp' });
            const checkScale = interpolate(frame, [18 + index * 6, 32 + index * 6], [0.4, 1], { extrapolateRight: 'clamp' });
            return (
              <div key={index} style={{ ...styles.row, opacity: rowOpacity, transform: `translateX(${rowX}px)` }}>
                <div style={{ ...styles.checkBadge, ...(accentColor ? { background: accentColor } : {}), transform: `scale(${checkScale})` }}>
                  <svg viewBox="0 0 24 24" style={styles.checkIcon} fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="4 12 10 18 20 6" />
                  </svg>
                </div>
                <div>
                  {item.heading && <span style={rowHeadingStyle}>{item.heading}</span>}
                  <span style={rowTextStyle}>{item.text}</span>
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

Content004.displayName = 'Content004';
export default Content004;
