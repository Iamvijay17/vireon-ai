import React, { useMemo } from 'react';
import { AbsoluteFill, Audio, interpolate, useCurrentFrame, useVideoConfig } from 'remotion';
import { CaptionRenderer } from '../../captions/CaptionRenderer';
import { typography, spacing, palette, mergeStyle, positionStyle } from '../../theme';
import { styles } from './styles';

/**
 * 009-content template ("Magazine Dek" variant of the "content" scene type)
 *
 * Editorial magazine layout: title as a headline, the first `items` entry
 * elevated into a large italic "dek" (deck) line beneath it, and the
 * remaining items rendered as a compact numbered list below a rule -
 * distinct from the step-cards, flow path, bullet list, card grid,
 * timeline, checklist, two-column, and glossary layouts already built.
 * Same elements shape as every other content variant - only the first
 * item is styled differently, no new fields are read.
 *
 * Data format: same as "001-content" - { title, items: [{heading?, text}] }.
 */
const Content009 = React.memo(({ scene }) => {
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

  const dek = items[0];
  const rest = items.slice(1);

  const titleStyle = mergeStyle({ ...typography.title, fontSize: 58, textAlign: 'left', marginBottom: spacing.md, ...positionStyle(overrides.title?.position) }, overrides.title);
  const titleOpacity = interpolate(frame, [0, 20], [0, 1], { extrapolateRight: 'clamp' });
  const titleY = interpolate(frame, [0, 25], [40, 0], { extrapolateRight: 'clamp' });
  const dekOpacity = interpolate(frame, [16, 34], [0, 1], { extrapolateRight: 'clamp' });
  const ruleScale = interpolate(frame, [30, 46], [0, 1], { extrapolateRight: 'clamp' });

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

        {dek && (dek.heading || dek.text) && (
          <p style={{ ...styles.dek, ...(accentColor ? { borderLeftColor: accentColor } : {}), opacity: dekOpacity }}>
            {dek.heading && <span style={styles.dekHeading}>{dek.heading} </span>}
            {dek.text}
          </p>
        )}

        {rest.length > 0 && (
          <>
            <div style={{ ...styles.rule, transform: `scaleX(${ruleScale})`, transformOrigin: 'left center' }} />
            <div style={styles.list}>
              {rest.map((item, index) => {
                const rowOpacity = interpolate(frame, [40 + index * 7, 56 + index * 7], [0, 1], { extrapolateRight: 'clamp' });
                const rowX = interpolate(frame, [40 + index * 7, 58 + index * 7], [-16, 0], { extrapolateRight: 'clamp' });
                return (
                  <div key={index} style={{ ...styles.row, opacity: rowOpacity, transform: `translateX(${rowX}px)` }}>
                    <span style={{ ...styles.index, ...(accentColor ? { color: accentColor } : {}) }}>{String(index + 2).padStart(2, '0')}</span>
                    <div>
                      {item.heading && <span style={styles.rowHeading}>{item.heading} </span>}
                      <span style={styles.rowText}>{item.text}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
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

Content009.displayName = 'Content009';
export default Content009;
