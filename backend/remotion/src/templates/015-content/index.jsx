import React, { useMemo } from 'react';
import { AbsoluteFill, Audio, interpolate, useCurrentFrame, useVideoConfig } from 'remotion';
import { CaptionRenderer } from '../../captions/CaptionRenderer';
import { typography, spacing, palette, mergeStyle, positionStyle } from '../../theme';
import { styles } from './styles';

/**
 * 015-content template ("Paragraph Stack" variant of the "content" scene type)
 *
 * Built for items whose `text` is a full paragraph, not a short phrase.
 * Unlike 014-content (which cycles items one at a time), this keeps every
 * item visible at once but in a single, wide column with generous
 * line-height/width and no card chrome, grid, or multi-column split - so
 * paragraph-length text stays readable instead of being squeezed into a
 * card or column meant for a short phrase. Best for scenes with 2-3 items;
 * for longer lists, prefer 014-content's slide-per-item pacing instead.
 *
 * Same elements shape as every other content variant -
 * { title, items: [{heading?, text}] }.
 */
const Content015 = React.memo(({ scene }) => {
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

        <div style={styles.stack}>
          {items.map((item, index) => {
            const rowOpacity = interpolate(frame, [15 + index * 10, 35 + index * 10], [0, 1], { extrapolateRight: 'clamp' });
            const rowY = interpolate(frame, [15 + index * 10, 40 + index * 10], [16, 0], { extrapolateRight: 'clamp' });
            return (
              <div key={index} style={{ ...styles.paragraphBlock, opacity: rowOpacity, transform: `translateY(${rowY}px)` }}>
                <div style={{ ...styles.markerLine, ...(accentColor ? { background: accentColor } : {}) }} />
                <div>
                  {item.heading && <p style={styles.paragraphHeading}>{item.heading}</p>}
                  {item.text && <p style={styles.paragraphText}>{item.text}</p>}
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

Content015.displayName = 'Content015';
export default Content015;
