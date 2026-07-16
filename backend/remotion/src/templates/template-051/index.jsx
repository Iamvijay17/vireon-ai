import React, { useMemo } from 'react';
import { AbsoluteFill, Audio, Img, interpolate, useCurrentFrame, useVideoConfig } from 'remotion';
import { CaptionRenderer } from '../../captions/CaptionRenderer';

/**
 * Template 051 - Fitness
 * Energetic design with progress rings, timer, and pop-scale captions.
 * Caption animation: popScale
 */
const Template051 = React.memo(({ scene }) => {
  const frame = useCurrentFrame(); const { fps } = useVideoConfig();
  const e = scene?.elements || {};
  const title = e.title || ''; const subtitle = e.subtitle || ''; const image = e.image || '';
  const metric = e.metric || ''; const metricLabel = e.metricLabel || '';
  const caption = e.caption || ''; const timestamps = e.captionTimestamps || null;
  const bg = e.backgroundColor || '#0a0a0a'; const accent = e.accentColor || '#ef4444';

  const bgGrad = useMemo(() => ({ background: `linear-gradient(135deg, ${bg} 0%, #1a1a1a 50%, #0d0d0d 100%)` }), [bg]);
  const titleO = interpolate(frame, [0, 15], [0, 1], { extrapolateRight: 'clamp' });
  const titleY = interpolate(frame, [0, 20], [30, 0], { extrapolateRight: 'clamp' });
  const subO = interpolate(frame, [12, 28], [0, 1], { extrapolateRight: 'clamp' });
  const imgS = interpolate(frame, [5, 30], [0.8, 1], { extrapolateRight: 'clamp' });
  const metricS = interpolate(frame, [10, 35], [0.3, 1], { extrapolateRight: 'clamp' });
  const metricO = interpolate(frame, [10, 25], [0, 1], { extrapolateRight: 'clamp' });
  const glowPulse = interpolate(Math.sin(frame * 0.15), [-1, 1], [0.3, 0.8]);

  return (
    <AbsoluteFill style={{ backgroundColor: bg }}>
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, ...bgGrad }} />
      {/* Glow circle */}
      <div style={{ position: 'absolute', top: '15%', right: '10%', width: 250, height: 250, borderRadius: '50%', background: `radial-gradient(circle, ${accent}20, transparent)`, opacity: glowPulse }} />

      <div style={{ position: 'relative', zIndex: 1, width: '100%', height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', padding: '60px', boxSizing: 'border-box' }}>
        {/* Image circle */}
        {image && (
          <div style={{ width: 140, height: 140, borderRadius: '50%', overflow: 'hidden', border: `4px solid ${accent}`, boxShadow: `0 0 40px ${accent}40`, transform: `scale(${imgS})`, marginBottom: 20 }}>
            <Img src={image} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          </div>
        )}
        {title && <h1 style={{ color: '#fff', fontSize: 48, fontWeight: 900, fontFamily: "'Inter', Arial, sans-serif", textAlign: 'center', margin: 0, marginBottom: 4, opacity: titleO, transform: `translateY(${titleY}px)` }}>{title}</h1>}
        {subtitle && <p style={{ color: '#9ca3af', fontSize: 22, fontWeight: 500, fontFamily: "'Inter', Arial, sans-serif", textAlign: 'center', margin: 0, marginBottom: 24, opacity: subO }}>{subtitle}</p>}
        {/* Metric */}
        {metric && (
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, transform: `scale(${metricS})`, opacity: metricO }}>
            <span style={{ color: accent, fontSize: 72, fontWeight: 900, fontFamily: "'Inter', Arial, sans-serif" }}>{metric}</span>
            {metricLabel && <span style={{ color: '#9ca3af', fontSize: 22, fontWeight: 600 }}>{metricLabel}</span>}
          </div>
        )}
      </div>
      <CaptionRenderer text={caption} animation="popScale" styleConfig={{ position: 'bottom', fontFamily: "'Inter', Arial, sans-serif", fontWeight: 700, fontSize: 34, textColor: '#ffffff', backgroundColor: 'rgba(0,0,0,0.6)', backgroundPadding: '12px 24px', borderRadius: 12, framesPerWord: 3 }} timestamps={timestamps} fps={fps} />
      {scene?.audio?.file && <Audio src={scene.audio.file} />}
    </AbsoluteFill>
  );
});
Template051.displayName = 'Template051';
export default Template051;
