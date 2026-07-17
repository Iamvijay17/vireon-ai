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

const PillItem = ({ item, index, fo, color }) => {
  const pillSlide = useSlideUp({ startAt: fo + 15 + index * 4, distance: 40 });
  return (
    <div style={{ ...s.pill, ...pillSlide, backgroundColor: `${color}22`, border: `2px solid ${color}55`, color }}>
      {item.icon && <span style={{ marginRight: 8 }}>{item.icon}</span>}
      {item.text || item.title || ''}
    </div>
  );
};

const useA = ({ fo = 0 } = {}) => {
  const bg = useFadeInOut({ fadeIn: fo, fadeInDuration: 10 });
  const tS = useSlideLeft({ startAt: fo + 5, distance: 40 });
  const subS = useSlideLeft({ startAt: fo + 10, distance: 30 });
  return { bgS: { opacity: bg }, tS, subS, fo };
};

const colors = ['#60a5fa', '#34d399', '#a78bfa', '#fb923c', '#f472b6', '#fbbf24', '#22d3ee', '#f87171'];

const T = React.memo(({ scene }) => {
  const e = scene?.elements || {};
  const t = e.title || ''; const sub = e.subtitle || ''; const items = e.items || e.tags || [];
  const bc = e.backgroundColor || backgroundColors.navy;
  const { bgS, tS, subS, fo } = useA({ fo: 0 });
  return (
    <AbsoluteFill style={{ backgroundColor: bc }}>
      <div style={{ ...s.container, ...bgS }}>
        {t && <h1 style={{ ...s.title, ...tS }}>{t}</h1>}
        {sub && <div style={{ ...s.subtitle, ...subS }}>{sub}</div>}
        <div style={s.row}>
          {items.map((item, i) => (
            <PillItem key={i} item={item} index={i} fo={fo} color={colors[i % colors.length]} />
          ))}
        </div>
      </div>
      {scene?.audio?.file && <Audio src={scene.audio.file} />}
    </AbsoluteFill>
  );
});
T.displayName = 'Template035';
export default T;
