import React, { useMemo } from 'react';
import { AbsoluteFill, Audio, interpolate, useCurrentFrame, useVideoConfig } from 'remotion';
import { CaptionRenderer } from '../../captions/CaptionRenderer';
import { typography, spacing, palette, mergeStyle, positionStyle } from '../../theme';
import { styles } from './styles';

/**
 * 005-content template ("Two-Column" variant of the "content" scene type)
 *
 * Title + the `items` array split roughly in half into a left and right
 * column of bullet rows, instead of 001-content's single vertical list or
 * 002-content's card grid. Good for longer item lists that would otherwise
 * run too tall in one column. Same elements shape as every other content
 * variant - the split is purely a rendering choice over the same array.
 *
 * Data format: same as "001-content" - { title, items: [{heading?, text}] }.
 */
const Content005 = React.memo(({ scene }) => {
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

  const columns = useMemo(() => {
    const mid = Math.ceil(items.length / 2);
    return [items.slice(0, mid), items.slice(mid)];
  }, [items]);

  const titleStyle = mergeStyle({ ...typography.title, fontSize: 52, textAlign: 'left', marginBottom: spacing.lg, ...positionStyle(overrides.title?.position) }, overrides.title);
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

        <div style={styles.columns}>
          {columns.map((col, colIndex) => (
            <div key={colIndex} style={styles.column}>
              {col.map((item, itemIndex) => {
                const index = colIndex * columns[0].length + itemIndex;
                const rowOpacity = interpolate(frame, [15 + index * 6, 30 + index * 6], [0, 1], { extrapolateRight: 'clamp' });
                const rowY = interpolate(frame, [15 + index * 6, 35 + index * 6], [16, 0], { extrapolateRight: 'clamp' });
                return (
                  <div key={itemIndex} style={{ ...styles.row, opacity: rowOpacity, transform: `translateY(${rowY}px)` }}>
                    <div style={{ ...styles.bulletDot, ...(accentColor ? { background: accentColor } : {}) }} />
                    <div>
                      {item.heading && <p style={styles.rowHeading}>{item.heading}</p>}
                      {item.text && <p style={styles.rowText}>{item.text}</p>}
                    </div>
                  </div>
                );
              })}
            </div>
          ))}
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

Content005.displayName = 'Content005';
export default Content005;
