import React from 'react';
import { AbsoluteFill, Audio } from 'remotion';
import { backgroundColors } from '../../styles';
import { useFadeInOut, useSlideUp } from '../../animations';

const s = {
  container: { width: '100%', height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: '60px 80px', boxSizing: 'border-box', position: 'relative', overflow: 'hidden' },
  title: { color: '#ffffff', fontSize: 40, fontWeight: 'bold', marginBottom: 30 },
  row: { display: 'flex', flexDirection: 'row', gap: 40, justifyContent: 'center', flexWrap: 'wrap' },
  card: { backgroundColor: 'rgba(255,255,255,0.04)', borderRadius: 16, padding: '30px 24px', width: 260, border: '1px solid rgba(255,255,255,0.08)', textAlign: 'center' },
  level: { color: '#60a5fa', fontSize: 16, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 },
  title2: { color: '#ffffff', fontSize: 28, fontWeight: 'bold', marginBottom: 10 },
  desc: { color: '#94a3b8', fontSize: 18, lineHeight: 1.4, marginBottom: 16 },
  tag: { display: 'inline-block', padding: '4px 14px', borderRadius: 12, backgroundColor: 'rgba(96,165,250,0.1)', color: '#60a5fa', fontSize: 14, fontWeight: 500, margin: '2px 4px' },
  tags: { display: 'flex', flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 4 },
};

const CardItem = ({ item, index, fo }) => {
  const cardSlide = useSlideUp({ startAt: fo + 12 + index * 8, distance: 60 });
  return (
    <div style={{ ...s.card, ...cardSlide }}>
      {item.level && <div style={s.level}>{item.level}</div>}
      <div style={s.title2}>{item.title}</div>
      <div style={s.desc}>{item.description || item.text}</div>
      {item.tags && <div style={s.tags}>{item.tags.map((tag, ti) => <span key={ti} style={s.tag}>{tag}</span>)}</div>}
    </div>
  );
};

const useA = ({ fo = 0 } = {}) => {
  const bg = useFadeInOut({ fadeIn: fo, fadeInDuration: 10 });
  const tS = useSlideUp({ startAt: fo + 5, distance: 40 });
  return { bgS: { opacity: bg }, tS, fo };
};

const T = React.memo(({ scene }) => {
  const e = scene?.elements || {};
  const items = e.items || e.cards || [];
  const t = e.title || '';
  const bc = e.backgroundColor || backgroundColors.dark;
  const { bgS, tS, fo } = useA({ fo: 0 });
  return (
    <AbsoluteFill style={{ backgroundColor: bc }}>
      <div style={{ ...s.container, ...bgS }}>
        {t && <h1 style={{ ...s.title, ...tS }}>{t}</h1>}
        <div style={s.row}>
          {items.map((item, i) => (
            <CardItem key={i} item={item} index={i} fo={fo} />
          ))}
        </div>
      </div>
      {scene?.audio?.file && <Audio src={scene.audio.file} />}
    </AbsoluteFill>
  );
});
T.displayName = 'Template034';
export default T;
