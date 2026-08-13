import React, { useMemo } from 'react';
import { AbsoluteFill, Audio, interpolate, useCurrentFrame, useVideoConfig } from 'remotion';
import { CaptionRenderer } from '../../captions/CaptionRenderer';
import { typography, palette, mergeStyle, positionStyle } from '../../theme';
import { styles } from './styles';

/**
 * Template 062 - Title + Bullets
 *
 * Canonical "PPT slide" layout for content scenes: title, accent line, and a
 * plain vertical list of rows (a small accent dot + text) - no icon badges,
 * no glassmorphism cards, no giant centered stat numbers. Generalized from
 * template-041's typography and theme.js's shared tokens.
 *
 * Data format:
 * {
 *   templateId: "template-062",
 *   elements: {
 *     title: "string",
 *     items: [{ heading?, text }] | stats: [{ value, label }],
 *     backgroundColor: "#hex",
 *     styleConfig: { title: {...}, subtitle: {...}, accentColor: "#hex" }
 *   }
 * }
 */
const Template062 = React.memo(({ scene }) => {
  const frame = useCurrentFrame();
  const { fps, width } = useVideoConfig();
  const elements = scene?.elements || {};
  const overrides = elements.styleConfig || {};

  // Rendered at whatever resolution the job requested (portrait Shorts vs
  // landscape) - scale the fixed-px theme values against the 1920px
  // reference width these tokens were designed at, so the layout doesn't
  // look cramped/oversized on other resolutions.
  const scale = width / 1920;

  const title = elements.title || '';
  const bgColor = elements.backgroundColor || palette.clean;
  const caption = elements.caption || '';
  const captionTimestamps = elements.captionTimestamps || null;

  // Accept either a plain bullet list or a stats array - either way it
  // renders as plain rows, not stat cards.
  const rows = useMemo(() => {
    const items = elements.items || elements.bullets;
    if (items?.length) {
      return items.map((item) => ({ heading: item.heading || item.title, text: item.text || item.description || '' }));
    }
    const stats = elements.stats || [];
    return stats.map((s) => ({ heading: s.value, text: s.label }));
  }, [elements.items, elements.bullets, elements.stats]);

  const titleStyle = mergeStyle({ ...typography.title, fontSize: 56, textAlign: 'left', marginBottom: 16, ...positionStyle(overrides.title?.position) }, overrides.title);
  const rowTextStyle = mergeStyle(typography.body, overrides.body);
  const rowHeadingStyle = mergeStyle(
    { ...typography.body, fontWeight: 600, color: palette.textOnDark, marginRight: 8 },
    overrides.heading
  );
  const accentColor = overrides.accentColor;

  const titleOpacity = interpolate(frame, [0, 20], [0, 1], { extrapolateRight: 'clamp' });
  const titleY = interpolate(frame, [0, 25], [40, 0], { extrapolateRight: 'clamp' });
  const lineScaleX = interpolate(frame, [5, 20], [0, 1], { extrapolateRight: 'clamp' });

  return (
    <AbsoluteFill style={{ backgroundColor: bgColor }}>
      <div style={{ ...styles.background, background: `linear-gradient(135deg, ${bgColor} 0%, #1a1a3e 60%, #0d1117 100%)` }} />

      <div style={{ ...styles.content, transform: `scale(${scale})`, transformOrigin: 'center center', width: `${100 / scale}%`, height: `${100 / scale}%` }}>
        {title && (
          <h1
            style={{
              ...titleStyle,
              opacity: titleOpacity,
              transform: `translateY(${titleY}px)`,
            }}
          >
            {title}
          </h1>
        )}

        <div
          style={{
            ...styles.accentLine,
            ...(accentColor ? { background: accentColor } : {}),
            transform: `scaleX(${lineScaleX})`,
            transformOrigin: 'left center',
            opacity: titleOpacity,
          }}
        />

        <div style={styles.list}>
          {rows.map((row, index) => {
            const rowOpacity = interpolate(frame, [15 + index * 6, 30 + index * 6], [0, 1], { extrapolateRight: 'clamp' });
            const rowX = interpolate(frame, [15 + index * 6, 35 + index * 6], [-20, 0], { extrapolateRight: 'clamp' });
            return (
              <div key={index} style={{ ...styles.row, opacity: rowOpacity, transform: `translateX(${rowX}px)` }}>
                <div style={{ ...styles.bulletDot, ...(accentColor ? { background: accentColor } : {}) }} />
                <div>
                  {row.heading && <span style={rowHeadingStyle}>{row.heading}</span>}
                  <span style={rowTextStyle}>{row.text}</span>
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

Template062.displayName = 'Template062';
export default Template062;
