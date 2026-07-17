import React from 'react';
import { AbsoluteFill, Audio } from 'remotion';
import { backgroundColors } from '../../styles';
import { useFadeInOut, useSlideUp, useSlideLeft } from '../../animations';

const s = {
  container: { width: '100%', height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: '60px 80px', boxSizing: 'border-box', position: 'relative', overflow: 'hidden' },
  stepRow: { display: 'flex', flexDirection: 'row', alignItems: 'center', gap: 24, marginBottom: 20, padding: '20px 28px', backgroundColor: 'rgba(255,255,255,0.03)', borderRadius: 14, border: '1px solid rgba(255,255,255,0.06)' },
  numBadge: { width: 48, height: 48, borderRadius: '50%', backgroundColor: 'rgba(96,165,250,0.15)', color: '#60a5fa', fontSize: 20, fontWeight: 'bold', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  content: { flex: 1 },
  stepTitle: { color: '#ffffff', fontSize: 24, fontWeight: 600, marginBottom: 4 },
  stepDesc: { color: '#94a3b8', fontSize: 20, lineHeight: 1.3 },
  title: { color: '#ffffff', fontSize: 40, fontWeight: 'bold', marginBottom: 8 },
  subtitle: { color: '#60a5fa', fontSize: 20, marginBottom: 30 },
};

const StepItem = ({ step, index, fo }) => {
  const stepSlide = useSlideLeft({ startAt: fo + 15 + index * 6, distance: 60 });
  return (
    <div style={{ ...s.stepRow, ...stepSlide }}>
      <div style={s.numBadge}>{step.num || (index + 1)}</div>
      <div style={s.content}>
        <div style={s.stepTitle}>{step.title}</div>
        {step.description && <div style={s.stepDesc}>{step.description}</div>}
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

const T = React.memo(({ scene }) => {
  const e = scene?.elements || {};
  const t = e.title || ''; const sub = e.subtitle || ''; const steps = e.steps || e.items || [];
  const bc = e.backgroundColor || backgroundColors.dark;
  const { bgS, tS, subS, fo } = useA({ fo: 0 });
  return (
    <AbsoluteFill style={{ backgroundColor: bc }}>
      <div style={{ ...s.container, ...bgS }}>
        {t && <h1 style={{ ...s.title, ...tS }}>{t}</h1>}
        {sub && <div style={{ ...s.subtitle, ...subS }}>{sub}</div>}
        {steps.map((st, i) => (
          <StepItem key={i} step={st} index={i} fo={fo} />
        ))}
      </div>
      {scene?.audio?.file && <Audio src={scene.audio.file} />}
    </AbsoluteFill>
  );
});
T.displayName = 'Template032';
export default T;
