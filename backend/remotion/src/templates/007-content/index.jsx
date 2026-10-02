import React, { useMemo } from 'react';
import { AbsoluteFill, Audio, interpolate, useCurrentFrame, useVideoConfig } from 'remotion';
import { CaptionRenderer } from '../../captions/CaptionRenderer';
import { typography, spacing, palette, mergeStyle, positionStyle, getContentScale, getOrientation } from '../../theme';
import { styles } from './styles';

/**
 * 007-content template ("Step Cards" variant of the "content" scene type)
 *
 * Title + the `items` array rendered as a horizontal, left-to-right row of
 * numbered step cards - each card carries a bold circular number badge, the
 * item.heading as a card title, and item.text underneath. A fundamentally
 * different layout (bordered horizontal card row with number badges) than
 * the pill-tag/bullet/grid/timeline/checklist/column/glossary layouts
 * already built. Same elements shape as every other content variant.
 *
 * Data format: same as "001-content" - { title, items: [{heading?, text}] }.
 */
const Content007 = React.memo(({ scene }) => {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();
  const elements = scene?.elements || {};
  const overrides = elements.styleConfig || {};
  const scale = getContentScale(width);
  // The horizontal row of cards squeezes hard on a narrow portrait/square
  // canvas - stack them in a column instead of shrinking the whole
  // 1920-wide row to fit.
  const isLandscape = getOrientation(width, height) === 'landscape';

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

      <div
        style={
          isLandscape
            ? { ...styles.content, transform: `scale(${scale})`, transformOrigin: 'center center', width: `${100 / scale}%`, height: `${100 / scale}%` }
            : { ...styles.content, padding: `${spacing.xxl}px ${spacing.xl}px` }
        }
      >
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

        <div style={isLandscape ? styles.row : { ...styles.row, flexDirection: 'column' }}>
          {items.map((item, index) => {
            if (!item.heading && !item.text) return null;
            const cardOpacity = interpolate(frame, [15 + index * 8, 32 + index * 8], [0, 1], { extrapolateRight: 'clamp' });
            const cardY = interpolate(frame, [15 + index * 8, 35 + index * 8], [24, 0], { extrapolateRight: 'clamp' });
            const badgeScale = interpolate(frame, [20 + index * 8, 36 + index * 8], [0.4, 1], { extrapolateRight: 'clamp' });
            return (
              <div key={index} style={{ ...styles.card, opacity: cardOpacity, transform: `translateY(${cardY}px)` }}>
                <div style={{ ...styles.badge, ...(accentColor ? { background: accentColor } : {}), transform: `scale(${badgeScale})` }}>
                  {index + 1}
                </div>
                {item.heading && <p style={styles.cardHeading}>{item.heading}</p>}
                {item.text && <p style={styles.cardText}>{item.text}</p>}
              </div>
            );
          })}
        </div>
      </div>

      <CaptionRenderer
        text={caption}
        animation={scene?.theme?.captionAnimation || 'fadeInUp'}
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

Content007.displayName = 'Content007';
export default Content007;
