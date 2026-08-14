import React, { useMemo } from 'react';
import { AbsoluteFill, Audio, interpolate, useCurrentFrame, useVideoConfig } from 'remotion';
import { CaptionRenderer } from '../../captions/CaptionRenderer';
import { typography, spacing, palette, mergeStyle, positionStyle } from '../../theme';
import { styles } from './styles';

/**
 * 007-content template ("Pill Tags" variant of the "content" scene type)
 *
 * Title + the `items` array rendered as a horizontal, wrapping row of
 * compact rounded pills (item.heading as the pill label), each with its
 * own small caption line underneath from item.text when present - a
 * fundamentally different layout (horizontal wrap of chips) than the
 * vertical/grid/timeline layouts already built. Same elements shape as
 * every other content variant.
 *
 * Data format: same as "001-content" - { title, items: [{heading?, text}] }.
 */
const Content007 = React.memo(({ scene }) => {
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

        <div style={styles.row}>
          {items.map((item, index) => {
            if (!item.heading) return null;
            const pillScale = interpolate(frame, [15 + index * 6, 32 + index * 6], [0.6, 1], { extrapolateRight: 'clamp' });
            const pillOpacity = interpolate(frame, [15 + index * 6, 30 + index * 6], [0, 1], { extrapolateRight: 'clamp' });
            return (
              <div key={index} style={{ ...styles.pillGroup, opacity: pillOpacity, transform: `scale(${pillScale})`, transformOrigin: 'left center' }}>
                <div style={{ ...styles.pill, ...(accentColor ? { background: accentColor, color: '#ffffff' } : {}) }}>{item.heading}</div>
                {item.text && <p style={styles.caption}>{item.text}</p>}
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

Content007.displayName = 'Content007';
export default Content007;
