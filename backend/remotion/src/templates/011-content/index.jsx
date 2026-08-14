import React, { useMemo } from 'react';
import { AbsoluteFill, Audio, interpolate, useCurrentFrame, useVideoConfig } from 'remotion';
import { CaptionRenderer } from '../../captions/CaptionRenderer';
import { typography, spacing, palette, mergeStyle, positionStyle } from '../../theme';
import { styles } from './styles';

/**
 * 011-content template ("Quote Highlight" variant of the "content" scene
 * type)
 *
 * The first `items` entry is elevated into a huge pull-quote (item.text in
 * large italic type, with item.heading as a small-caps attribution line
 * beneath a giant decorative quotation glyph), and any remaining items
 * render as a compact footnote row underneath - distinct from every other
 * content variant, which treats all items uniformly. Same elements shape
 * as every other content variant - only the first item is styled
 * differently, no new fields are read.
 *
 * Data format: same as "001-content" - { title, items: [{heading?, text}] }.
 */
const Content011 = React.memo(({ scene }) => {
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

  const quote = items[0];
  const footnotes = items.slice(1);

  const titleStyle = mergeStyle({ ...typography.label, fontSize: 20, textAlign: 'left', marginBottom: spacing.lg, ...positionStyle(overrides.title?.position) }, overrides.title);
  const titleOpacity = interpolate(frame, [0, 18], [0, 1], { extrapolateRight: 'clamp' });
  const markOpacity = interpolate(frame, [0, 18], [0, 1], { extrapolateRight: 'clamp' });
  const quoteOpacity = interpolate(frame, [12, 34], [0, 1], { extrapolateRight: 'clamp' });
  const quoteY = interpolate(frame, [12, 34], [20, 0], { extrapolateRight: 'clamp' });
  const attributionOpacity = interpolate(frame, [30, 46], [0, 1], { extrapolateRight: 'clamp' });

  return (
    <AbsoluteFill style={{ backgroundColor: bgColor }}>
      <div style={{ ...styles.background, background: `linear-gradient(135deg, ${bgColor} 0%, #1a1a3e 60%, #0d1117 100%)` }} />

      <div style={{ ...styles.content, transform: `scale(${scale})`, transformOrigin: 'center center', width: `${100 / scale}%`, height: `${100 / scale}%` }}>
        {title && (
          <p data-style-role="title" style={{ ...titleStyle, opacity: titleOpacity, textTransform: 'uppercase', letterSpacing: 3 }}>{title}</p>
        )}

        <div style={{ ...styles.mark, ...(accentColor ? { color: accentColor } : {}), opacity: markOpacity }}>&ldquo;</div>

        {quote && quote.text && (
          <p style={{ ...styles.quote, opacity: quoteOpacity, transform: `translateY(${quoteY}px)` }}>{quote.text}</p>
        )}

        {quote && quote.heading && (
          <p style={{ ...styles.attribution, ...(accentColor ? { color: accentColor } : {}), opacity: attributionOpacity }}>
            &mdash; {quote.heading}
          </p>
        )}

        {footnotes.length > 0 && (
          <div style={styles.footnoteRow}>
            {footnotes.map((item, index) => {
              const noteOpacity = interpolate(frame, [46 + index * 6, 60 + index * 6], [0, 1], { extrapolateRight: 'clamp' });
              return (
                <div key={index} style={{ ...styles.footnote, opacity: noteOpacity }}>
                  {item.heading && <span style={styles.footnoteHeading}>{item.heading}: </span>}
                  <span style={styles.footnoteText}>{item.text}</span>
                </div>
              );
            })}
          </div>
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

Content011.displayName = 'Content011';
export default Content011;
