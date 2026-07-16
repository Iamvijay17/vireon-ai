import React from 'react';
import { AbsoluteFill, Audio, Img } from 'remotion';
import { backgroundColors } from '../../styles';
import { useFadeInOut, useSlideUp, useZoomIn } from '../../animations';

const s = {
  container: { width: '100%', height: '100%', display: 'flex', flexDirection: 'row', padding: 0, boxSizing: 'border-box', position: 'relative', overflow: 'hidden' },
  imgPanel: { flex: 1, position: 'relative', overflow: 'hidden' },
  textPanel: { flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: '50px 50px' },
  img: { width: '100%', height: '100%', objectFit: 'cover' },
  label: { color: '#f59e0b', fontSize: 16, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 12 },
  title: { color: '#ffffff', fontSize: 38, fontWeight: 'bold', lineHeight: 1.2, marginBottom: 16 },
  body: { color: '#94a3b8', fontSize: 22, lineHeight: 1.5, marginBottom: 20 },
  stat: { color: '#60a5fa', fontSize: 20, fontWeight: 600 },
  overlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, background: 'linear-gradient(90deg, rgba(15,23,42,0.7) 0%, transparent 100%)', zIndex: 1 },
};

const useA = ({ fo = 0 } = {}) => {
  const bg = useFadeInOut({ fadeIn: fo, fadeInDuration: 10 });
  const imgZ = useZoomIn({ startAt: fo + 2, duration: 40, from: 1.05, to: 1 });
  const lF = useFadeInOut({ fadeIn: fo + 10, fadeInDuration: 10 });
  const tS = useSlideUp({ startAt: fo + 15, distance: 40 });
  const bS = useSlideUp({ startAt: fo + 22, distance: 30 });
  return { bgS: { opacity: bg }, imgS: imgZ, lS: { opacity: lF }, tS, bS };
};

const T = React.memo(({ scene }) => {
  const e = scene?.elements || {};
  const t = e.title || ''; const b = e.body || e.text || ''; const img = e.image || '';
  const lab = e.label || ''; const stat = e.stat || ''; const bc = e.backgroundColor || backgroundColors.dark;
  const a = useA({ fo: 0 });
  return (
    <AbsoluteFill style={{ backgroundColor: bc }}>
      <div style={{ ...s.container, ...a.bgS }}>
        <div style={s.imgPanel}>
          <div style={s.overlay} />
          {img && <Img src={img} style={{ ...s.img, ...a.imgS }} />}
        </div>
        <div style={s.textPanel}>
          {lab && <div style={{ ...s.label, ...a.lS }}>{lab}</div>}
          {t && <h1 style={{ ...s.title, ...a.tS }}>{t}</h1>}
          {b && <p style={{ ...s.body, ...a.bS }}>{b}</p>}
          {stat && <div style={{ ...s.stat, ...a.bS }}>{stat}</div>}
        </div>
      </div>
      {scene?.audio?.file && <Audio src={scene.audio.file} />}
    </AbsoluteFill>
  );
});
T.displayName = 'Template036';
export default T;
