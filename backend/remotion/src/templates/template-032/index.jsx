import React from 'react';
import { AbsoluteFill, Audio } from 'remotion';
import { backgroundColors } from '../../styles';
import { spacing, mergeStyle } from '../../theme';
import { useFadeInOut, useSlideUp, useSlideLeft } from '../../animations';

/**
 * Template 032 - Step Guide
 * Layout: Numbered steps as plain rows with a hairline divider - no card
 * chrome.
 *
 * JSON data format:
 * {
 *   templateId: "template-032",
 *   elements: { title, subtitle?, items: [{ heading, text }], backgroundColor?, styleConfig? }
 * }
 */
const s = {
  container: { width: '100%', height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: `${spacing.xxl}px ${spacing.xxxl}px`, boxSizing: 'border-box', position: 'relative', overflow: 'hidden' },
  stepRow: { display: 'flex', flexDirection: 'row', alignItems: 'center', gap: spacing.lg, padding: `${spacing.md}px 0`, borderBottom: '1px solid rgba(255,255,255,0.08)' },
  numBadge: { width: 40, height: 40, borderRadius: '50%', backgroundColor: 'rgba(96,165,250,0.12)', color: '#60a5fa', fontSize: 18, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  content: { flex: 1 },
  stepTitle: { color: '#ffffff', fontSize: 24, fontWeight: 600, marginBottom: 4 },
  stepDesc: { color: '#94a3b8', fontSize: 20, lineHeight: 1.3 },
  title: { color: '#ffffff', fontSize: 56, fontWeight: 300, marginBottom: 8 },
  subtitle: { color: '#60a5fa', fontSize: 20, marginBottom: spacing.xl },
};

const StepItem = ({ item, index, fo }) => {
  const stepSlide = useSlideLeft({ startAt: fo + 15 + index * 6, distance: 40 });
  const heading = item.heading || item.title || '';
  const text = item.text || item.description || '';
  return (
    <div style={{ ...s.stepRow, ...stepSlide }}>
      <div style={s.numBadge}>{index + 1}</div>
      <div style={s.content}>
        <div style={s.stepTitle}>{heading}</div>
        {text && <div style={s.stepDesc}>{text}</div>}
      </div>
    </div>
  );
};

const useA = ({ fo = 0 } = {}) => {
  const bg = useFadeInOut({ fadeIn: fo, fadeInDuration: 10 });
  const tS = useSlideLeft({ startAt: fo + 5, distance: 40 });
  const subS = useSlideLeft({ startAt: fo + 10, distance: 30 });
  return { bgS: { opacity: bg }, tS, subS, fo };
};

const T = React.memo(({ scene }) => {
  const e = scene?.elements || {};
  const t = e.title || ''; const sub = e.subtitle || '';
  // Back-compat: older scenes may still carry the old `steps` field name.
  const items = e.items || e.steps || [];
  const bc = e.backgroundColor || backgroundColors.dark;
  const overrides = e.styleConfig || {};
  const titleStyle = mergeStyle(s.title, overrides.title);
  const { bgS, tS, subS, fo } = useA({ fo: 0 });
  return (
    <AbsoluteFill style={{ backgroundColor: bc }}>
      <div style={{ ...s.container, ...bgS }}>
        {t && <h1 style={{ ...titleStyle, ...tS }}>{t}</h1>}
        {sub && <div style={{ ...s.subtitle, ...subS }}>{sub}</div>}
        {items.map((item, i) => (
          <StepItem key={i} item={item} index={i} fo={fo} />
        ))}
      </div>
      {scene?.audio?.file && <Audio src={scene.audio.file} />}
    </AbsoluteFill>
  );
});
T.displayName = 'Template032';
export default T;
