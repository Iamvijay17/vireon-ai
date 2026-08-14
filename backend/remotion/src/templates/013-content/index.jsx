import React, { useMemo } from 'react';
import { AbsoluteFill, Audio, interpolate, useCurrentFrame, useVideoConfig } from 'remotion';
import { CaptionRenderer } from '../../captions/CaptionRenderer';
import { typography, spacing, palette, mergeStyle, positionStyle } from '../../theme';
import { styles } from './styles';

/**
 * 013-content template ("Ribbon List" variant of the "content" scene type)
 *
 * Title + the `items` array rendered as full-width horizontal ribbon rows
 * stacked vertically, each with a giant faint index numeral bleeding off
 * the left edge behind the heading/text - a table-of-contents/magazine
 * index feel, distinct from the compact bullet rows, cards, badges, and
 * columns of every other content variant. Same elements shape as every
 * other content variant.
 *
 * Data format: same as "001-content" - { title, items: [{heading?, text}] }.
 */
const Content013 = React.memo(({ scene }) => {
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

  const titleStyle = mergeStyle({ ...typography.title, fontSize: 46, textAlign: 'left', marginBottom: spacing.lg, ...positionStyle(overrides.title?.position) }, overrides.title);
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

        <div style={styles.list}>
          {items.map((item, index) => {
            const ribbonOpacity = interpolate(frame, [14 + index * 8, 30 + index * 8], [0, 1], { extrapolateRight: 'clamp' });
            const ribbonX = interpolate(frame, [14 + index * 8, 34 + index * 8], [-40, 0], { extrapolateRight: 'clamp' });
            return (
              <div
                key={index}
                style={{
                  ...styles.ribbon,
                  ...(index % 2 === 1 ? styles.ribbonAlt : {}),
                  opacity: ribbonOpacity,
                  transform: `translateX(${ribbonX}px)`,
                }}
              >
                <span style={{ ...styles.bigIndex, ...(accentColor ? { color: accentColor } : {}) }}>{String(index + 1).padStart(2, '0')}</span>
                <div style={styles.ribbonText}>
                  {item.heading && <p style={styles.ribbonHeading}>{item.heading}</p>}
                  {item.text && <p style={styles.ribbonBody}>{item.text}</p>}
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

Content013.displayName = 'Content013';
export default Content013;
