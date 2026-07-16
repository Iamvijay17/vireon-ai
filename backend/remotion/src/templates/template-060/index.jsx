import React, { useMemo } from 'react';
import { AbsoluteFill, Audio, Img, interpolate, useCurrentFrame, useVideoConfig } from 'remotion';
import { CaptionRenderer } from '../../captions/CaptionRenderer';

/**
 * Template 060 - Comedy
 * Bright, playful design with colorful accents, emoji reactions, and bounce captions.
 * Caption animation: bounce
 */
const Template060 = React.memo(({ scene }) => {
  const frame = useCurrentFrame(); const { fps } = useVideoConfig();
  const e = scene?.elements || {};
  const title = e.title || ''; const subtitle = e.subtitle || ''; const image = e.image || '';
  const emoji = e.emoji || ''; const caption = e.caption || '';
  const timestamps = e.captionTimestamps || null;
  const bg = e.backgroundColor || '#1a0a0a'; const accent = e.accentColor || '#facc15';

  const bgGrad = useMemo(() => ({ background: `linear-gradient(135deg, ${bg} 0%, #2d1a0a 50%, #1a0a1a 100%)` }), [bg]);
  const titleO = interpolate(frame, [0, 15], [0, 1], { extrapolateRight: 'clamp' });
  const titleY = interpolate(frame, [0, 20], [40, 0], { extrapolateRight: 'clamp' });
  const subO = interpolate(frame, [12, 28], [0, 1], { extrapolateRight: 'clamp' });
  const imgS = interpolate(Math.sin(frame * 0.08), [-1, 1], [0.95, 1.05]);
  const emojiS = interpolate(frame, [5, 25], [0, 1], { extrapolateRight: 'clamp' });
  const confetti = useMemo(() => Array.from({ length: 12 }, (_, i) => i), []);

  return (
    <AbsoluteFill style={{ backgroundColor: bg }}>
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, ...bgGrad }} />
      {/* Confetti dots */}
      {confetti.map((c) => (
        <div key={c} style={{ position: 'absolute', width: 6, height: 6, borderRadius: '50%', backgroundColor: ['#facc15','#ef4444','#22c55e','#3b82f6','#a855f7'][c%5], opacity: 0.4, left: `${c * 8 + 2}%`, top: `${(frame * 2 + c * 30) % 100}%`, transform: `scale(${interpolate(Math.sin(frame * 0.1 + c), [-1,1], [0.5,1])})` }} />
      ))}
      <div style={{ position: 'relative', zIndex: 1, width: '100%', height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', padding: '60px', boxSizing: 'border-box' }}>
        {emoji && <div style={{ fontSize: 72, marginBottom: 12, transform: `scale(${emojiS})` }}>{emoji}</div>}
        {image && <div style={{ width: 160, height: 160, borderRadius: '50%', overflow: 'hidden', border: `3px solid ${accent}`, transform: `scale(${imgS})`, marginBottom: 16 }}><Img src={image} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /></div>}
        {title && <h1 style={{ color: '#fff', fontSize: 52, fontWeight: 900, fontFamily: "'Inter', Arial, sans-serif", textAlign: 'center', margin: 0, marginBottom: 6, opacity: titleO, transform: `translateY(${titleY}px)` }}>{title}</h1>}
        {subtitle && <p style={{ color: accent, fontSize: 20, fontWeight: 600, fontFamily: "'Inter', Arial, sans-serif", textAlign: 'center', margin: 0, opacity: subO }}>{subtitle}</p>}
      </div>
      <CaptionRenderer text={caption} animation="bounce" styleConfig={{ position: 'bottom', fontFamily: "'Inter', Arial, sans-serif", fontWeight: 700, fontSize: 36, textColor: '#ffffff', backgroundColor: 'rgba(0,0,0,0.5)', backgroundPadding: '14px 28px', borderRadius: 16, framesPerWord: 4 }} timestamps={timestamps} fps={fps} />
      {scene?.audio?.file && <Audio src={scene.audio.file} />}
    </AbsoluteFill>
  );
});
Template060.displayName = 'Template060';
export default Template060;
