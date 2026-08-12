import React from 'react';
import { AbsoluteFill, Audio } from 'remotion';
import { backgroundColors } from '../../styles';
import { spacing, mergeStyle } from '../../theme';
import { useFadeInOut, useSlideUp, useSlideLeft } from '../../animations';

// Plain rows - no card chrome, no icon badges.
const s = {
  container: { width: '100%', height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: `${spacing.xxl}px ${spacing.xxxl}px`, boxSizing: 'border-box', position: 'relative', overflow: 'hidden' },
  title: { color: '#ffffff', fontSize: 56, fontWeight: 300, marginBottom: spacing.xl },
  list: { display: 'flex', flexDirection: 'column', gap: spacing.lg, width: '100%', maxWidth: '80%' },
  row: { display: 'flex', flexDirection: 'row', alignItems: 'baseline', gap: spacing.md, borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: spacing.sm },
  rowTitle: { color: '#ffffff', fontSize: 24, fontWeight: 600, minWidth: 220 },
  rowDesc: { color: '#94a3b8', fontSize: 18, lineHeight: 1.3 },
};

const Row = ({ item, index, fo, textStyle }) => {
  const rowAnim = useSlideUp({ startAt: fo + 12 + index * 5, distance: 30 });
  // Back-compat: older scenes may still carry {text, description} or
  // {title, description} (both were produced by earlier code paths before
  // this was standardized on {heading, text}).
  const heading = item.heading || item.text || item.title || '';
  const text = item.text && item.heading ? item.text : item.description || '';
  return (
    <div style={{ ...s.row, ...rowAnim }}>
      <div style={s.rowTitle}>{heading}</div>
      {text && <div style={{ ...s.rowDesc, ...textStyle }}>{text}</div>}
    </div>
  );
};

const useA = ({ fo = 0 } = {}) => {
  const bg = useFadeInOut({ fadeIn: fo, fadeInDuration: 10 });
  const tS = useSlideLeft({ startAt: fo + 5, distance: 40 });
  return { bgS: { opacity: bg }, tS, fo };
};

const T = React.memo(({ scene }) => {
  const e = scene?.elements || {};
  const t = e.title || ''; const items = e.items || e.cards || [];
  const bc = e.backgroundColor || backgroundColors.slate;
  const overrides = e.styleConfig || {};
  const { bgS, tS, fo } = useA({ fo: 0 });
  const titleStyle = mergeStyle(s.title, overrides.title);
  return (
    <AbsoluteFill style={{ backgroundColor: bc }}>
      <div style={{ ...s.container, ...bgS }}>
        {t && <h1 style={{ ...titleStyle, ...tS }}>{t}</h1>}
        <div style={s.list}>
          {items.map((item, i) => (
            <Row key={i} item={item} index={i} fo={fo} textStyle={overrides.body} />
          ))}
        </div>
      </div>
      {scene?.audio?.file && <Audio src={scene.audio.file} />}
    </AbsoluteFill>
  );
});
T.displayName = 'Template038';
export default T;
