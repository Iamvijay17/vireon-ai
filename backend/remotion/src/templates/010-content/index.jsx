import React, { useMemo } from 'react';
import { AbsoluteFill, Audio, interpolate, useCurrentFrame, useVideoConfig } from 'remotion';
import { CaptionRenderer } from '../../captions/CaptionRenderer';
import { typography, spacing, palette, mergeStyle, positionStyle } from '../../theme';
import { styles } from './styles';

/**
 * 010-content template ("Monogram Row" variant of the "content" scene type)
 *
 * Title + the `items` array rendered as a horizontal row of square
 * monogram tiles (first letter of item.heading, large and bold) each
 * paired with the full heading and text stacked beneath it - a compact
 * icon/tile-strip layout, distinct from the numbered badges of 007/008,
 * the plain rows of 001/006/009, the card grid of 002, the timeline of
 * 003, the checklist of 004, and the two-column split of 005. Same
 * elements shape as every other content variant.
 *
 * Data format: same as "001-content" - { title, items: [{heading?, text}] }.
 */
const Content010 = React.memo(({ scene }) => {
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

  const titleStyle = mergeStyle({ ...typography.title, fontSize: 52, textAlign: 'left', marginBottom: spacing.xxl, ...positionStyle(overrides.title?.position) }, overrides.title);
  const titleOpacity = interpolate(frame, [0, 20], [0, 1], { extrapolateRight: 'clamp' });
  const titleY = interpolate(frame, [0, 25], [40, 0], { extrapolateRight: 'clamp' });

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

        <div style={styles.row}>
          {items.map((item, index) => {
            const tileScale = interpolate(frame, [16 + index * 8, 32 + index * 8], [0.5, 1], { extrapolateRight: 'clamp' });
            const tileOpacity = interpolate(frame, [16 + index * 8, 30 + index * 8], [0, 1], { extrapolateRight: 'clamp' });
            const textOpacity = interpolate(frame, [26 + index * 8, 42 + index * 8], [0, 1], { extrapolateRight: 'clamp' });
            const letter = (item.heading || item.text || '?').trim().charAt(0).toUpperCase();
            return (
              <div key={index} style={styles.tileGroup}>
                <div style={{ ...styles.tile, ...(accentColor ? { background: accentColor, color: '#0d1117' } : {}), transform: `scale(${tileScale})`, opacity: tileOpacity }}>
                  {letter}
                </div>
                <div style={{ opacity: textOpacity }}>
                  {item.heading && <p style={styles.tileHeading}>{item.heading}</p>}
                  {item.text && <p style={styles.tileText}>{item.text}</p>}
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

Content010.displayName = 'Content010';
export default Content010;
