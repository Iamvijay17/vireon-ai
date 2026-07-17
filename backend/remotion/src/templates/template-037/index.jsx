import React from 'react';
import { AbsoluteFill, Audio } from 'remotion';
import { backgroundColors } from '../../styles';
import { useFadeInOut, useSlideUp } from '../../animations';

const s = {
  container: { width: '100%', height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: '60px 80px', boxSizing: 'border-box', position: 'relative', overflow: 'hidden' },
  title: { color: '#ffffff', fontSize: 40, fontWeight: 'bold', marginBottom: 8 },
  sub: { color: '#94a3b8', fontSize: 22, marginBottom: 35 },
  card: { display: 'flex', flexDirection: 'row', alignItems: 'center', gap: 20, padding: '22px 28px', backgroundColor: 'rgba(255,255,255,0.03)', borderRadius: 14, marginBottom: 12, border: '1px solid rgba(255,255,255,0.06)' },
  num: { color: '#60a5fa', fontSize: 32, fontWeight: 'bold', minWidth: 50, opacity: 0.5 },
  cTitle: { color: '#ffffff', fontSize: 24, fontWeight: 600, marginBottom: 4 },
  cDesc: { color: '#94a3b8', fontSize: 18, lineHeight: 1.3 },
};

const CardItem = ({ item, index, fo }) => {
  const cardSlide = useSlideUp({ startAt: fo + 15 + index * 6, distance: 50 });
  return (
    <div style={{ ...s.card, ...cardSlide }}>
      <div style={s.num}>{item.year || item.num || (index + 1)}</div>
      <div style={{ flex: 1 }}>
        <div style={s.cTitle}>{item.title}</div>
        {item.description && <div style={s.cDesc}>{item.description}</div>}
      </div>
    </div>
  );
};

const useA = ({ fo = 0 } = {}) => {
  const bg = useFadeInOut({ fadeIn: fo, fadeInDuration: 10 });
  const tS = useSlideUp({ startAt: fo + 5, distance: 40 });
  const subS = useSlideUp({ startAt: fo + 10, distance: 30 });
  return { bgS: { opacity: bg }, tS, subS, fo };
};

const T = React.memo(({ scene }) => {
  const e = scene?.elements || {};
  const t = e.title || ''; const sub = e.subtitle || ''; const items = e.items || e.milestones || [];
  const bc = e.backgroundColor || backgroundColors.dark;
  const { bgS, tS, subS, fo } = useA({ fo: 0 });
  return (
    <AbsoluteFill style={{ backgroundColor: bc }}>
      <div style={{ ...s.container, ...bgS }}>
        {t && <h1 style={{ ...s.title, ...tS }}>{t}</h1>}
        {sub && <div style={{ ...s.sub, ...subS }}>{sub}</div>}
        {items.map((item, i) => (
          <CardItem key={i} item={item} index={i} fo={fo} />
        ))}
      </div>
      {scene?.audio?.file && <Audio src={scene.audio.file} />}
    </AbsoluteFill>
  );
});
T.displayName = 'Template037';
export default T;
