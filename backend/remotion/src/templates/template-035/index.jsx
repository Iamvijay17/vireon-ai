import React from 'react';
import { AbsoluteFill, Audio } from 'remotion';
import { backgroundColors } from '../../styles';
import { useFadeInOut, useSlideUp, useSlideLeft } from '../../animations';

const s = {
  container: { width: '100%', height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: '60px 80px', boxSizing: 'border-box', position: 'relative', overflow: 'hidden' },
  title: { color: '#ffffff', fontSize: 40, fontWeight: 'bold', marginBottom: 8 },
  subtitle: { color: '#94a3b8', fontSize: 22, marginBottom: 30 },
  row: { display: 'flex', flexDirection: 'row', gap: 20, flexWrap: 'wrap' },
  pill: { padding: '14px 28px', borderRadius: 50, fontSize: 22, fontWeight: 500, backdropFilter: 'blur(8px)' },
};

const useA = ({ fo = 0 } = {}) => {
  const bg = useFadeInOut({ fadeIn: fo, fadeInDuration: 10 });
  const tS = useSlideLeft({ startAt: fo + 5, distance: 40 });
  const subS = useSlideLeft({ startAt: fo + 10, distance: 30 });
  const gPA = (i) => useSlideUp({ startAt: fo + 15 + i * 4, distance: 40 });
  return { bgS: { opacity: bg }, tS, subS, gPA };
};

const colors = ['#60a5fa', '#34d399', '#a78bfa', '#fb923c', '#f472b6', '#fbbf24', '#22d3ee', '#f87171'];

const T = React.memo(({ scene }) => {
  const e = scene?.elements || {};
  const t = e.title || ''; const sub = e.subtitle || ''; const items = e.items || e.tags || [];
  const bc = e.backgroundColor || backgroundColors.navy; const a = useA({ fo: 0 });
  return (
    <AbsoluteFill style={{ backgroundColor: bc }}>
      <div style={{ ...s.container, ...a.bgS }}>
        {t && <h1 style={{ ...s.title, ...a.tS }}>{t}</h1>}
        {sub && <div style={{ ...s.subtitle, ...a.subS }}>{sub}</div>}
        <div style={s.row}>
          {items.map((item, i) => (
            <div key={i} style={{ ...s.pill, ...a.gPA(i), backgroundColor: `${colors[i % colors.length]}22`, border: `2px solid ${colors[i % colors.length]}55`, color: colors[i % colors.length] }}>
              {item.icon && <span style={{ marginRight: 8 }}>{item.icon}</span>}
              {item.text || item}
            </div>
          ))}
        </div>
      </div>
      {scene?.audio?.file && <Audio src={scene.audio.file} />}
    </AbsoluteFill>
  );
});
T.displayName = 'Template035';
export default T;
