import React, { useMemo } from 'react';
import { AbsoluteFill, Audio, interpolate, useCurrentFrame, useVideoConfig } from 'remotion';
import { CaptionRenderer } from '../../captions/CaptionRenderer';

/**
 * Template 049 - Tutorial
 * Clean layout with step counter, code-like typography, and typewriter captions.
 * Caption animation: typewriter
 */
const Template049 = React.memo(({ scene }) => {
  const frame = useCurrentFrame(); const { fps } = useVideoConfig();
  const e = scene?.elements || {};
  const title = e.title || ''; const step = e.step || ''; const body = e.body || '';
  const caption = e.caption || ''; const timestamps = e.captionTimestamps || null;
  const bg = e.backgroundColor || '#0d1117'; const accent = e.accentColor || '#22c55e';

  const bgGrad = useMemo(() => ({ background: `linear-gradient(180deg, ${bg} 0%, #161b22 100%)` }), [bg]);
  const titleO = interpolate(frame, [0, 15], [0, 1], { extrapolateRight: 'clamp' });
  const titleY = interpolate(frame, [0, 20], [20, 0], { extrapolateRight: 'clamp' });
  const stepS = interpolate(frame, [5, 25], [0.5, 1], { extrapolateRight: 'clamp' });
  const bodyO = interpolate(frame, [15, 35], [0, 1], { extrapolateRight: 'clamp' });
  const borderX = interpolate(frame, [0, 20], [0, 1], { extrapolateRight: 'clamp' });

  return (
    <AbsoluteFill style={{ backgroundColor: bg }}>
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, ...bgGrad }} />
      {/* Left accent border */}
      <div style={{ position: 'absolute', top: 80, left: 60, bottom: 160, width: 3, backgroundColor: accent, transform: `scaleY(${borderX})`, transformOrigin: 'top', opacity: 0.6 }} />

      <div style={{ position: 'relative', zIndex: 1, width: '100%', height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: '60px 60px 160px 100px', boxSizing: 'border-box' }}>
        {title && <h1 style={{ color: '#fff', fontSize: 44, fontWeight: 700, fontFamily: "'JetBrains Mono', 'Fira Code', monospace", margin: 0, marginBottom: 24, opacity: titleO, transform: `translateY(${titleY}px)` }}>{title}</h1>}
        {step && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 16 }}>
            <span style={{ backgroundColor: accent, color: '#000', fontSize: 20, fontWeight: 800, fontFamily: "'JetBrains Mono', monospace", padding: '4px 12px', borderRadius: 6, transform: `scale(${stepS})` }}>{step}</span>
            {body && <span style={{ color: '#cbd5e1', fontSize: 22, fontWeight: 400, fontFamily: "'JetBrains Mono', monospace", opacity: bodyO }}>{body}</span>}
          </div>
        )}
      </div>
      <CaptionRenderer text={caption} animation="typewriter" styleConfig={{ position: 'bottom', fontFamily: "'JetBrains Mono', 'Fira Code', monospace", fontWeight: 500, fontSize: 30, textColor: '#ffffff', backgroundColor: 'rgba(0,0,0,0.7)', backgroundPadding: '12px 24px', borderRadius: 8, framesPerWord: 4 }} timestamps={timestamps} fps={fps} />
      {scene?.audio?.file && <Audio src={scene.audio.file} />}
    </AbsoluteFill>
  );
});
Template049.displayName = 'Template049';
export default Template049;
