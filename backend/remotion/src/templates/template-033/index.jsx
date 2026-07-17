import React from 'react';
import { AbsoluteFill, Audio, Img } from 'remotion';
import { backgroundColors } from '../../styles';
import { useFadeInOut, useSlideUp, useZoomIn, useSlideLeft } from '../../animations';

const s = {
  container: { width: '100%', height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: '60px 80px', boxSizing: 'border-box', position: 'relative', overflow: 'hidden' },
  title: { color: '#ffffff', fontSize: 40, fontWeight: 'bold', marginBottom: 12 },
  subtitle: { color: '#94a3b8', fontSize: 22, marginBottom: 35 },
  card: { display: 'flex', flexDirection: 'row', gap: 20, padding: '20px 24px', backgroundColor: 'rgba(255,255,255,0.04)', borderRadius: 14, marginBottom: 14, alignItems: 'center' },
  iconBox: { width: 56, height: 56, borderRadius: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 28, flexShrink: 0 },
  cardTitle: { color: '#ffffff', fontSize: 22, fontWeight: 600, marginBottom: 4 },
  cardDesc: { color: '#94a3b8', fontSize: 18, lineHeight: 1.3 },
  cardContent: { flex: 1 },
};

const CardItem = ({ item, index, fo }) => {
  const cardSlide = useSlideLeft({ startAt: fo + 15 + index * 5, distance: 60 });
  return (
    <div style={{ ...s.card, ...cardSlide }}>
      <div style={{ ...s.iconBox, backgroundColor: colors[index % colors.length] }}>{item.icon || icons[index % icons.length]}</div>
      <div style={s.cardContent}>
        <div style={s.cardTitle}>{item.title}</div>
        <div style={s.cardDesc}>{item.description || item.text}</div>
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

const icons = ['\uD83D\uDCA1', '\uD83D\uDD0D', '\uD83D\uDE80', '\uD83D\uDEE0', '\uD83D\uDD12', '\uD83D\uDCC8', '\u2699', '\uD83C\uDF10'];
const colors = ['#60a5fa33', '#34d39933', '#a78bfa33', '#fb923c33', '#f472b633', '#fbbf2433', '#22d3ee33', '#f8717133'];

const T = React.memo(({ scene }) => {
  const e = scene?.elements || {};
  const t = e.title || ''; const sub = e.subtitle || ''; const items = e.items || e.cards || [];
  const bc = e.backgroundColor || backgroundColors.slate;
  const { bgS, tS, subS, fo } = useA({ fo: 0 });
  return (
    <AbsoluteFill style={{ backgroundColor: bc }}>
      <div style={{ ...s.container, ...bgS }}>
        {t && <h1 style={{ ...s.title, ...tS }}>{t}</h1>}
        {sub && <div style={{ ...s.subtitle, ...subS }}>{sub}</div>}
        {items.map((item, i) => (
          <CardItem key={i} item={item} index={i} fo={fo} />
        ))}
      </div>
      {scene?.audio?.file && <Audio src={scene.audio.file} />}
    </AbsoluteFill>
  );
});
T.displayName = 'Template033';
export default T;
