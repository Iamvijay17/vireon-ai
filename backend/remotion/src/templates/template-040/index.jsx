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
  return { bgS: { opacity: bg }, tS, subS, fo };
};

const chColors = ['#60a5fa22', '#34d39922', '#a78bfa22', '#fb923c22', '#f472b622', '#fbbf2422', '#22d3ee22'];

const ChipItem = ({ item, index, fo, color }) => {
  const itemSlide = useSlideUp({ startAt: fo + 15 + index * 4, distance: 40 });
  return (
    <div style={{ ...s.chip, ...itemSlide, backgroundColor: color, border: `1px solid ${color.replace('22', '55')}` }}>
      {item.icon && <span style={s.chipIcon}>{item.icon}</span>}
      <span style={{ color: '#e2e8f0' }}>{item.text || item.title || ''}</span>
    </div>
  );
};

const T = React.memo(({ scene }) => {
  const e = scene?.elements || {};
  const t = e.title || ''; const sub = e.subtitle || ''; const items = e.items || e.chips || [];
  const bc = e.backgroundColor || backgroundColors.navy;
  const { bgS, tS, subS, fo } = useA({ fo: 0 });
  return (
    <AbsoluteFill style={{ backgroundColor: bc }}>
      <div style={{ ...s.container, ...bgS }}>
        {t && <h1 style={{ ...s.title, ...tS }}>{t}</h1>}
        {sub && <div style={{ ...s.sub, ...subS }}>{sub}</div>}
      <div style={s.row}>
          {items.map((item, i) => (
            <ChipItem key={i} item={item} index={i} fo={fo} color={chColors[i % chColors.length]} />
          ))}
        </div>
      </div>
      {scene?.audio?.file && <Audio src={scene.audio.file} />}
    </AbsoluteFill>
  );
});
T.displayName = 'Template040';
export default T;
