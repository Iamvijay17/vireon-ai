import React, { useMemo } from 'react';
import { AbsoluteFill, Audio, interpolate, useCurrentFrame, useVideoConfig } from 'remotion';
import { CaptionRenderer } from '../../captions/CaptionRenderer';
import { typography, spacing, palette, mergeStyle, positionStyle } from '../../theme';
import { styles } from './styles';

/**
 * 008-content template ("Flow Path" variant of the "content" scene type)
 *
 * Title + the `items` array rendered as a horizontal process-flow diagram:
 * a connecting line runs behind a row of circular number nodes, with each
 * node's heading/text stacked underneath it - a journey/pipeline diagram,
 * distinct from the bordered step-cards (007), bullet list, card grid,
 * timeline, checklist, two-column, and glossary layouts already built.
 * Same elements shape as every other content variant.
 *
 * Data format: same as "001-content" - { title, items: [{heading?, text}] }.
 */
const Content008 = React.memo(({ scene }) => {
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
  const lineScaleX = interpolate(frame, [18, 46], [0, 1], { extrapolateRight: 'clamp' });

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

        <div style={styles.pathRow}>
          <div
            style={{
              ...styles.connector,
              ...(accentColor ? { background: accentColor } : {}),
              transform: `scaleX(${lineScaleX})`,
              transformOrigin: 'left center',
            }}
          />
          {items.map((item, index) => {
            const nodeScale = interpolate(frame, [16 + index * 10, 32 + index * 10], [0.3, 1], { extrapolateRight: 'clamp' });
            const nodeOpacity = interpolate(frame, [16 + index * 10, 30 + index * 10], [0, 1], { extrapolateRight: 'clamp' });
            const textOpacity = interpolate(frame, [26 + index * 10, 42 + index * 10], [0, 1], { extrapolateRight: 'clamp' });
            return (
              <div key={index} style={styles.node}>
                <div style={{ ...styles.nodeCircle, ...(accentColor ? { background: accentColor } : {}), transform: `scale(${nodeScale})`, opacity: nodeOpacity }}>
                  {index + 1}
                </div>
                <div style={{ ...styles.nodeText, opacity: textOpacity }}>
                  {item.heading && <p style={styles.nodeHeading}>{item.heading}</p>}
                  {item.text && <p style={styles.nodeBody}>{item.text}</p>}
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

Content008.displayName = 'Content008';
export default Content008;
