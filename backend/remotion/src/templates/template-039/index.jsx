import React from 'react';
import { AbsoluteFill, Audio, Img } from 'remotion';
import { backgroundColors } from '../../styles';
import { useFadeInOut, useSlideUp, useZoomIn } from '../../animations';

const s = {
  container: { width: '100%', height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', padding: '60px 80px', boxSizing: 'border-box', position: 'relative', overflow: 'hidden' },
  img: { width: 200, height: 200, borderRadius: '50%', objectFit: 'cover', border: '4px solid rgba(96,165,250,0.3)', marginBottom: 30 },
  name: { color: '#ffffff', fontSize: 40, fontWeight: 'bold', marginBottom: 6 },
  role: { color: '#60a5fa', fontSize: 24, fontWeight: 500, marginBottom: 16 },
  bio: { color: '#94a3b8', fontSize: 22, lineHeight: 1.5, textAlign: 'center', maxWidth: '70%', marginBottom: 24 },
  statRow: { display: 'flex', flexDirection: 'row', gap: 30 },
  stat: { textAlign: 'center' },
  statV: { color: '#fbbf24', fontSize: 28, fontWeight: 'bold' },
  statL: { color: '#94a3b8', fontSize: 16 },
};

const useA = ({ fo = 0 } = {}) => {
  const bg = useFadeInOut({ fadeIn: fo, fadeInDuration: 10 });
  const imgZ = useZoomIn({ startAt: fo + 5, duration: 25, from: 0.5, to: 1 });
  const nS = useSlideUp({ startAt: fo + 15, distance: 30 });
  const rF = useFadeInOut({ fadeIn: fo + 22, fadeInDuration: 10 });
  const bS = useSlideUp({ startAt: fo + 28, distance: 30 });
  const sF = useFadeInOut({ fadeIn: fo + 35, fadeInDuration: 15 });
  return { bgS: { opacity: bg }, imgS: imgZ, nS, rS: { opacity: rF }, bS, sS: { opacity: sF } };
};

const T = React.memo(({ scene }) => {
  const e = scene?.elements || {};
  const n = e.name || ''; const r = e.role || ''; const b = e.bio || e.text || '';
  const img = e.image || e.avatar || ''; const st = e.stats || e.items || [];
  const bc = e.backgroundColor || backgroundColors.dark; const a = useA({ fo: 0 });
  return (
    <AbsoluteFill style={{ backgroundColor: bc }}>
      <div style={{ ...s.container, ...a.bgS }}>
        {img && <Img src={img} style={{ ...s.img, ...a.imgS }} />}
        {n && <h1 style={{ ...s.name, ...a.nS }}>{n}</h1>}
        {r && <div style={{ ...s.role, ...a.rS }}>{r}</div>}
        {b && <p style={{ ...s.bio, ...a.bS }}>{b}</p>}
        {st.length > 0 && <div style={{ ...s.statRow, ...a.sS }}>{st.map((s2, i) => <div key={i} style={s.stat}><div style={s.statV}>{s2.value}</div><div style={s.statL}>{s2.label}</div></div>)}</div>}
      </div>
      {scene?.audio?.file && <Audio src={scene.audio.file} />}
    </AbsoluteFill>
  );
});
T.displayName = 'Template039';
export default T;
