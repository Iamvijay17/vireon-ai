import React from 'react';
import { AbsoluteFill, Audio } from 'remotion';
import { backgroundColors } from '../../styles';
import { useFadeInOut, useSlideUp, usePop } from '../../animations';
import { mergeStyle, positionStyle } from '../../theme';

/**
 * Template 006 - Quote Testimonial (Outro)
 * Layout: Closing-scene layout with a large final message, an attribution
 * line, and an optional badge. Left-aligned quote-mark composition.
 *
 * JSON data format:
 * {
 *   templateId: "template-006",
 *   elements: {
 *     title: "string" (closing quote / message),
 *     body: "string" (attribution line),
 *     badge: "string" (optional, e.g. "Final Word"),
 *     backgroundColor: "#hex" (optional)
 *   },
 *   audio: { file: "path" },
 *   duration: number
 * }
 */
const s = {
  container: { width: '100%', height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: '70px 100px', boxSizing: 'border-box', position: 'relative', overflow: 'hidden' },
  quoteMark: { color: 'rgba(96,165,250,0.35)', fontSize: 140, fontWeight: 900, fontFamily: 'Georgia, serif', lineHeight: 1, marginBottom: -30 },
  title: { color: '#ffffff', fontSize: 42, fontWeight: 700, lineHeight: 1.3, marginBottom: 26, maxWidth: '85%' },
  line: { width: 70, height: 4, borderRadius: 2, backgroundColor: '#60a5fa', marginBottom: 20 },
  body: { color: '#94a3b8', fontSize: 22, fontWeight: 600 },
  badge: { position: 'absolute', top: 60, right: 100, backgroundColor: 'rgba(96,165,250,0.15)', color: '#60a5fa', fontSize: 15, fontWeight: 700, padding: '8px 18px', borderRadius: 20, textTransform: 'uppercase', letterSpacing: 1.5 },
};

const Template006 = React.memo(({ scene }) => {
  const e = scene?.elements || {};
  const title = e.title || e.quote || '';
  const body = e.body || e.author || '';
  const badge = e.badge || '';
  const bgColor = e.backgroundColor || backgroundColors.dark;
  const overrides = e.styleConfig || {};

  const bgFade = useFadeInOut({ fadeIn: 0, fadeInDuration: 10 });
  const markPop = usePop({ startAt: 3 });
  const titleSlide = useSlideUp({ startAt: 10, distance: 40 });
  const lineFade = useFadeInOut({ fadeIn: 26, fadeInDuration: 12 });
  const bodyFade = useFadeInOut({ fadeIn: 32, fadeInDuration: 14 });
  const badgeFade = useFadeInOut({ fadeIn: 8, fadeInDuration: 12 });

  return (
    <AbsoluteFill style={{ backgroundColor: bgColor }}>
      <div style={{ ...s.container, opacity: bgFade }}>
        {badge && <div style={{ ...s.badge, opacity: badgeFade }}>{badge}</div>}
        <div style={{ ...s.quoteMark, ...markPop }}>&rdquo;</div>
        {title && <h1 data-style-role="title" style={mergeStyle({ ...s.title, ...titleSlide, ...positionStyle(overrides.title?.position) }, overrides.title)}>{title}</h1>}
        <div style={{ ...s.line, opacity: lineFade }} />
        {body && <div data-style-role="subtitle" style={mergeStyle({ ...s.body, opacity: bodyFade, ...positionStyle(overrides.subtitle?.position) }, overrides.subtitle)}>{body}</div>}
      </div>
      {scene?.audio?.file && <Audio src={scene.audio.file} />}
    </AbsoluteFill>
  );
});

Template006.displayName = 'Template006';

export default Template006;
