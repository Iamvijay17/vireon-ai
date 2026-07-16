import React from 'react';
import { AbsoluteFill, Audio } from 'remotion';
import { backgroundColors } from '../../styles';
import { useFadeInOut, useSlideUp, useSlideLeft } from '../../animations';

const s = {
  container: { width: '100%', height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: '60px 80px', boxSizing: 'border-box', position: 'relative', overflow: 'hidden' },
  title: { color: '#ffffff', fontSize: 40, fontWeight: 'bold', marginBottom: 30 },
  grid: { display: 'flex', flexDirection: 'row', gap: 20, flexWrap: 'wrap', justifyContent: 'center' },
  card: { backgroundColor: 'rgba(255,255,255,0.04)', borderRadius: 16, padding: '28px 24px', width: 230, border: '1px solid rgba(255,255,255,0.08)', textAlign: 'center' },
  icon: { fontSize: 40, marginBottom: 12 },
  cardTitle: { color: '#ffffff', fontSize: 22, fontWeight: 600, marginBottom: 8 },
  cardDesc: { color: '#94a3b8', fontSize: 16, lineHeight: 1.3 },
};

const useA = ({ fo = 0 } = {}) => {
  const bg = useFadeInOut({ fadeIn: fo, fadeInDuration: 10 });
  const tS = useSlideLeft({ startAt: fo + 5, distance: 40 });
  const gCA = (i) => useSlideUp({ startAt: fo + 12 + i * 5, distance: 50 });
  return { bgS: { opacity: bg }, tS, gCA };
};

const T = React.memo(({ scene }) => {
  const e = scene?.elements || {};
  const t = e.title || ''; const items = e.items || e.cards || [];
  const bc = e.backgroundColor || backgroundColors.slate; const a = useA({ fo: 0 });
  return (
    <AbsoluteFill style={{ backgroundColor: bc }}>
      <div style={{ ...s.container, ...a.bgS }}>
        {t && <h1 style={{ ...s.title, ...a.tS }}>{t}</h1>}
        <div style={s.grid}>
          {items.map((item, i) => (
            <div key={i} style={{ ...s.card, ...a.gCA(i) }}>
              <div style={s.icon}>{item.icon || '\uD83D\uDCCA'}</div>
              <div style={s.cardTitle}>{item.title}</div>
              {item.description && <div style={s.cardDesc}>{item.description}</div>}
            </div>
          ))}
        </div>
      </div>
      {scene?.audio?.file && <Audio src={scene.audio.file} />}
    </AbsoluteFill>
  );
});
T.displayName = 'Template038';
export default T;
