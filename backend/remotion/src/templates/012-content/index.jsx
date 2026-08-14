import React, { useMemo } from 'react';
import { AbsoluteFill, Audio, interpolate, useCurrentFrame, useVideoConfig } from 'remotion';
import { CaptionRenderer } from '../../captions/CaptionRenderer';
import { typography, spacing, palette, mergeStyle, positionStyle } from '../../theme';
import { styles } from './styles';

/**
 * 012-content template ("Versus" variant of the "content" scene type)
 *
 * Title + the `items` array split into two opposing sides by alternating
 * index (even items on the left, right-aligned with a tinted panel; odd
 * items on the right, left-aligned with a differently tinted panel),
 * separated by a center divider line with a round "VS" badge - a
 * comparison/opposition framing, distinct from 005-content's plain
 * half-and-half two-column split and every other content variant. Same
 * elements shape as every other content variant.
 *
 * Data format: same as "001-content" - { title, items: [{heading?, text}] }.
 */
const Content012 = React.memo(({ scene }) => {
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

  const leftItems = useMemo(() => items.filter((_, i) => i % 2 === 0), [items]);
  const rightItems = useMemo(() => items.filter((_, i) => i % 2 === 1), [items]);

  const titleStyle = mergeStyle({ ...typography.title, fontSize: 46, textAlign: 'center', marginBottom: spacing.xl, ...positionStyle(overrides.title?.position) }, overrides.title);
  const titleOpacity = interpolate(frame, [0, 20], [0, 1], { extrapolateRight: 'clamp' });
  const titleY = interpolate(frame, [0, 25], [30, 0], { extrapolateRight: 'clamp' });
  const badgeScale = interpolate(frame, [10, 28], [0.3, 1], { extrapolateRight: 'clamp' });
  const dividerScale = interpolate(frame, [6, 24], [0, 1], { extrapolateRight: 'clamp' });

  const renderColumn = (list, align, startDelay) => (
    <div style={{ ...styles.column, alignItems: align === 'right' ? 'flex-end' : 'flex-start', textAlign: align }}>
      {list.map((item, index) => {
        const rowOpacity = interpolate(frame, [startDelay + index * 8, startDelay + 16 + index * 8], [0, 1], { extrapolateRight: 'clamp' });
        const rowX = interpolate(frame, [startDelay + index * 8, startDelay + 18 + index * 8], [align === 'right' ? 20 : -20, 0], { extrapolateRight: 'clamp' });
        return (
          <div key={index} style={{ ...styles.card, opacity: rowOpacity, transform: `translateX(${rowX}px)` }}>
            {item.heading && <p style={styles.cardHeading}>{item.heading}</p>}
            {item.text && <p style={styles.cardText}>{item.text}</p>}
          </div>
        );
      })}
    </div>
  );

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

        <div style={styles.arena}>
          {renderColumn(leftItems, 'right', 18)}

          <div style={styles.centerRail}>
            <div style={{ ...styles.dividerLine, transform: `scaleY(${dividerScale})`, transformOrigin: 'top center' }} />
            <div style={{ ...styles.vsBadge, ...(accentColor ? { background: accentColor } : {}), transform: `scale(${badgeScale})` }}>VS</div>
          </div>

          {renderColumn(rightItems, 'left', 24)}
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

Content012.displayName = 'Content012';
export default Content012;
