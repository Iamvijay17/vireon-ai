import React from 'react';
import { AbsoluteFill, Audio } from 'remotion';
import { backgroundColors } from '../../styles';
import { useFadeInOut, useSlideUp, useSlideLeft } from '../../animations';

const s = {
  container: { width: '100%', height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: '60px 80px', boxSizing: 'border-box', position: 'relative', overflow: 'hidden' },
  title: { color: '#ffffff', fontSize: 40, fontWeight: 'bold', marginBottom: 8 },
  sub: { color: '#94a3b8', fontSize: 22, marginBottom: 30 },
  row: { display: 'flex', flexDirection: 'row', gap: 16, flexWrap: 'wrap', justifyContent: 'center' },
  chip: { padding: '12px 24px', borderRadius: 12, fontSize: 20, fontWeight: 500, display: 'flex', alignItems: 'center', gap: 10 },
  chipIcon: { fontSize: 24 },
};

const useA = ({ fo = 0 } = {}) => {
  const bg = useFadeInOut({ fadeIn: fo, fadeInDuration: 10 });
  const tS = useSlideLeft({ startAt: fo + 5, distance: 40 });
  const subS = useSlideLeft({ startAt: fo + 10, distance: 30 });
  const gCA = (i) => useSlideUp({ startAt: fo + 15 + i * 4, distance: 40 });
  return { bgS: { opacity: bg }, tS, subS, gCA };
};

const chColors = ['#60a5fa22', '#34d39922', '#a78bfa22', '#fb923c22', '#f472b622', '#fbbf2422', '#22d3ee22'];

const T = React.memo(({ scene }) => {
  const e = scene?.elements || {};
  const t = e.title || ''; const sub = e.subtitle || ''; const items = e.items || e.chips || [];
  const bc = e.backgroundColor || backgroundColors.navy; const a = useA({ fo: 0 });
  return (
    <AbsoluteFill style={{ backgroundColor: bc }}>
      <div style={{ ...s.container, ...a.bgS }}>
        {t && <h1 style={{ ...s.title, ...a.tS }}>{t}</h1>}
        {sub && <div style={{ ...s.sub, ...a.subS }}>{sub}</div>}
        <div style={s.row}>
          {items.map((item, i) => (
            <div key={i} style={{ ...s.chip, ...a.gCA(i), backgroundColor: chColors[i % chColors.length], border: `1px solid ${chColors[i % chColors.length].replace('22', '55')}` }}>
              {item.icon && <span style={s.chipIcon}>{item.icon}</span>}
              <span style={{ color: '#e2e8f0' }}>{item.text || item}</span>
            </div>
          ))}
        </div>
      </div>
      {scene?.audio?.file && <Audio src={scene.audio.file} />}
    </AbsoluteFill>
  );
});
T.displayName = 'Template040';
export default T;
