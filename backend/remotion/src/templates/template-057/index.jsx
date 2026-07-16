import React, { useMemo } from 'react';
import { AbsoluteFill, Audio, Img, interpolate, useCurrentFrame, useVideoConfig } from 'remotion';
import { CaptionRenderer } from '../../captions/CaptionRenderer';

/**
 * Template 057 - Science
 * Lab-inspired design with beaker, data points, and zoom captions.
 * Caption animation: zoom
 */
const Template057 = React.memo(({ scene }) => {
  const frame = useCurrentFrame(); const { fps } = useVideoConfig();
  const e = scene?.elements || {};
  const title = e.title || ''; const subtitle = e.subtitle || ''; const image = e.image || '';
  const caption = e.caption || ''; const timestamps = e.captionTimestamps || null;
  const bg = e.backgroundColor || '#0a1628'; const accent = e.accentColor || '#06b6d4';

  const bgGrad = useMemo(() => ({ background: `linear-gradient(135deg, ${bg} 0%, #0d2137 50%, ${bg} 100%)` }), [bg]);
  const titleO = interpolate(frame, [0, 18], [0, 1], { extrapolateRight: 'clamp' });
  const titleY = interpolate(frame, [0, 22], [30, 0], { extrapolateRight: 'clamp' });
  const subO = interpolate(frame, [14, 30], [0, 1], { extrapolateRight: 'clamp' });
  const imgS = interpolate(frame, [5, 25], [0.85, 1], { extrapolateRight: 'clamp' });
  const particles = useMemo(() => Array.from({ length: 8 }, (_, i) => i), []);

  return (
    <AbsoluteFill style={{ backgroundColor: bg }}>
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, ...bgGrad }} />
      {/* Floating particles */}
      {particles.map((p) => (
        <div key={p} style={{ position: 'absolute', width: 4, height: 4, borderRadius: '50%', backgroundColor: accent, opacity: 0.3, left: `${10 + p * 10}%`, top: `${20 + interpolate(Math.sin(frame * 0.05 + p), [-1, 1], [0, 30])}%`, filter: `blur(${p % 2}px)` }} />
      ))}
      <div style={{ position: 'relative', zIndex: 1, width: '100%', height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', padding: '60px', boxSizing: 'border-box' }}>
        {image && <div style={{ width: 180, height: 180, borderRadius: 16, overflow: 'hidden', border: `2px solid ${accent}50`, boxShadow: `0 0 30px ${accent}20`, transform: `scale(${imgS})`, marginBottom: 20 }}><Img src={image} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /></div>}
        {title && <h1 style={{ color: '#fff', fontSize: 48, fontWeight: 700, fontFamily: "'Inter', Arial, sans-serif", textAlign: 'center', margin: 0, marginBottom: 8, opacity: titleO, transform: `translateY(${titleY}px)` }}>{title}</h1>}
        {subtitle && <p style={{ color: '#94a3b8', fontSize: 22, fontFamily: "'Inter', Arial, sans-serif", textAlign: 'center', margin: 0, opacity: subO }}>{subtitle}</p>}
      </div>
      <CaptionRenderer text={caption} animation="zoom" animationConfig={{ zoomFrom: 0.4 }} styleConfig={{ position: 'bottom', fontFamily: "'Inter', Arial, sans-serif", fontWeight: 600, fontSize: 32, textColor: '#ffffff', backgroundColor: 'rgba(0,0,0,0.6)', backgroundPadding: '12px 24px', borderRadius: 10, framesPerWord: 3 }} timestamps={timestamps} fps={fps} />
      {scene?.audio?.file && <Audio src={scene.audio.file} />}
    </AbsoluteFill>
  );
});
Template057.displayName = 'Template057';
export default Template057;
