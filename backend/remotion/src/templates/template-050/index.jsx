import React, { useMemo } from 'react';
import { AbsoluteFill, Audio, interpolate, useCurrentFrame, useVideoConfig } from 'remotion';
import { CaptionRenderer } from '../../captions/CaptionRenderer';

/**
 * Template 050 - Gaming
 * Neon-lit, cyberpunk aesthetic with animated scanlines, glow effects, and zoom captions.
 * Caption animation: zoom
 */
const Template050 = React.memo(({ scene }) => {
  const frame = useCurrentFrame(); const { fps } = useVideoConfig();
  const e = scene?.elements || {};
  const title = e.title || ''; const subtitle = e.subtitle || ''; const caption = e.caption || '';
  const timestamps = e.captionTimestamps || null;
  const bg = e.backgroundColor || '#0a0015'; const accent = e.accentColor || '#ff00ff';

  const bgGrad = useMemo(() => ({ background: `linear-gradient(135deg, ${bg} 0%, #1a0030 50%, #0d0020 100%)` }), [bg]);
  const titleO = interpolate(frame, [0, 15], [0, 1], { extrapolateRight: 'clamp' });
  const titleX = interpolate(frame, [0, 20], [60, 0], { extrapolateRight: 'clamp' });
  const subO = interpolate(frame, [12, 30], [0, 1], { extrapolateRight: 'clamp' });
  const glowPulse = interpolate(Math.sin(frame * 0.08), [-1, 1], [0.6, 1]);
  const scanPos = (frame * 3) % 100;

  return (
    <AbsoluteFill style={{ backgroundColor: bg }}>
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, ...bgGrad }} />
      {/* Scanlines */}
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, opacity: 0.08, backgroundImage: 'repeating-linear-gradient(0deg, transparent, transparent 2px, #fff 2px, #fff 3px)' }} />
      {/* Scanning line */}
      <div style={{ position: 'absolute', left: 0, right: 0, height: 3, backgroundColor: accent, opacity: 0.3 * glowPulse, top: `${scanPos}%`, boxShadow: `0 0 20px ${accent}` }} />
      {/* Vignette corners */}
      <div style={{ position: 'absolute', top: 0, left: 0, width: 150, height: 150, background: `radial-gradient(circle at top left, ${accent}30, transparent)`, opacity: glowPulse }} />
      <div style={{ position: 'absolute', bottom: 0, right: 0, width: 150, height: 150, background: `radial-gradient(circle at bottom right, ${accent}30, transparent)`, opacity: glowPulse }} />

      <div style={{ position: 'relative', zIndex: 1, width: '100%', height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', padding: '60px', boxSizing: 'border-box' }}>
        {title && <h1 style={{ color: '#fff', fontSize: 64, fontWeight: 900, fontFamily: "'Orbitron', 'Press Start 2P', monospace", textAlign: 'center', margin: 0, marginBottom: 16, letterSpacing: 4, textShadow: `0 0 30px ${accent}, 0 0 60px ${accent}60`, opacity: titleO, transform: `translateX(${titleX}px)` }}>{title}</h1>}
        {subtitle && <p style={{ color: accent, fontSize: 24, fontWeight: 600, fontFamily: "'Orbitron', monospace", textAlign: 'center', margin: 0, textTransform: 'uppercase', letterSpacing: 6, opacity: subO }}>{subtitle}</p>}
      </div>
      <CaptionRenderer text={caption} animation="zoom" animationConfig={{ zoomFrom: 0.3 }} styleConfig={{ position: 'bottom', fontFamily: "'Orbitron', monospace", fontWeight: 700, fontSize: 30, textColor: '#ffffff', strokeColor: '#000', strokeWidth: 4, backgroundColor: 'rgba(0,0,0,0.7)', backgroundPadding: '12px 24px', borderRadius: 8, framesPerWord: 3 }} timestamps={timestamps} fps={fps} />
      {scene?.audio?.file && <Audio src={scene.audio.file} />}
    </AbsoluteFill>
  );
});
Template050.displayName = 'Template050';
export default Template050;
