import React, { useMemo } from 'react';
import { AbsoluteFill, Audio, interpolate, useCurrentFrame, useVideoConfig } from 'remotion';
import { CaptionRenderer } from '../../captions/CaptionRenderer';
import { typography, spacing, palette, mergeStyle, positionStyle } from '../../theme';
import { styles } from './styles';

/**
 * 006-content template ("Definition Glossary" variant of the "content"
 * scene type)
 *
 * Title + each item rendered as a "term" (item.heading) followed by its
 * "definition" (item.text), separated by thin divider lines between
 * entries - a glossary/dictionary look, distinct from the bullet list,
 * card grid, timeline, checklist, and two-column variants already built.
 * Same elements shape as every other content variant.
 *
 * Data format: same as "001-content" - { title, items: [{heading?, text}] }.
 */
const Content006 = React.memo(({ scene }) => {
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

        <div style={styles.list}>
          {items.map((item, index) => {
            const entryOpacity = interpolate(frame, [15 + index * 8, 32 + index * 8], [0, 1], { extrapolateRight: 'clamp' });
            const entryY = interpolate(frame, [15 + index * 8, 35 + index * 8], [16, 0], { extrapolateRight: 'clamp' });
            const dividerScale = interpolate(frame, [20 + index * 8, 36 + index * 8], [0, 1], { extrapolateRight: 'clamp' });
            return (
              <div key={index} style={{ ...styles.entry, opacity: entryOpacity, transform: `translateY(${entryY}px)` }}>
                {item.heading && (
                  <p style={{ ...styles.term, ...(accentColor ? { color: accentColor } : {}) }}>{item.heading}</p>
                )}
                {item.text && <p style={styles.definition}>{item.text}</p>}
                {index < items.length - 1 && (
                  <div style={{ ...styles.divider, transform: `scaleX(${dividerScale})`, transformOrigin: 'left center', marginTop: spacing.md }} />
                )}
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

Content006.displayName = 'Content006';
export default Content006;
