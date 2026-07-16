import React from 'react';
import { AbsoluteFill, Audio } from 'remotion';
import { backgroundColors } from '../../styles';
import { useFadeInOut, useSlideUp, useSlideLeft } from '../../animations';

const s = {
  container: { width: '100%', height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: '60px 80px', boxSizing: 'border-box', position: 'relative', overflow: 'hidden' },
  title: { color: '#ffffff', fontSize: 42, fontWeight: 'bold', marginBottom: 12 },
  meta: { color: '#94a3b8', fontSize: 20, marginBottom: 30, fontStyle: 'italic' },
  quote: { color: '#e2e8f0', fontSize: 28, lineHeight: 1.5, marginBottom: 24, fontStyle: 'italic', borderLeft: '4px solid #60a5fa', paddingLeft: 24 },
  author: { color: '#fbbf24', fontSize: 22, fontWeight: 600 },
  source: { color: '#94a3b8', fontSize: 18 },
};

const useA = ({ fo = 0 } = {}) => {
  const bg = useFadeInOut({ fadeIn: fo, fadeInDuration: 10 });
  const tS = useSlideLeft({ startAt: fo + 5, distance: 40 });
  const mF = useFadeInOut({ fadeIn: fo + 10, fadeInDuration: 10 });
  const qS = useSlideUp({ startAt: fo + 15, distance: 50 });
  const aS = useFadeInOut({ fadeIn: fo + 28, fadeInDuration: 12 });
  return { bgS: { opacity: bg }, tS, mS: { opacity: mF }, qS, aS: { opacity: aS } };
};

const T = React.memo(({ scene }) => {
  const e = scene?.elements || {};
  const t = e.title || ''; const m = e.meta || ''; const q = e.quote || e.text || '';
  const a = e.author || ''; const src = e.source || ''; const bc = e.backgroundColor || backgroundColors.navy;
  const an = useA({ fo: 0 });
  return (
    <AbsoluteFill style={{ backgroundColor: bc }}>
      <div style={{ ...s.container, ...an.bgS }}>
        {t && <h1 style={{ ...s.title, ...an.tS }}>{t}</h1>}
        {m && <div style={{ ...s.meta, ...an.mS }}>{m}</div>}
        {q && <div style={{ ...s.quote, ...an.qS }}>{q}</div>}
        {a && <div style={{ ...s.author, ...an.aS }}>{a}{src && <span style={s.source}> - {src}</span>}</div>}
      </div>
      {scene?.audio?.file && <Audio src={scene.audio.file} />}
    </AbsoluteFill>
  );
});
T.displayName = 'Template031';
export default T;
