import React, { useMemo } from 'react';
import { AbsoluteFill, Audio, Img, interpolate, useCurrentFrame, useVideoConfig } from 'remotion';
import { CaptionRenderer } from '../../captions/CaptionRenderer';

/**
 * Template 046 - Tech Review
 * Dark theme with device frame mockup, specs overlay, and glowing captions.
 * Caption animation: glowActive
 */
const Template046 = React.memo(({ scene }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const e = scene?.elements || {};
  const title = e.title || '';
  const subtitle = e.subtitle || '';
  const deviceImage = e.deviceImage || '';
  const specs = e.specs || [];
  const caption = e.caption || '';
  const timestamps = e.captionTimestamps || null;
  const bg = e.backgroundColor || '#0a0a1a';
  const accent = e.accentColor || '#22d3ee';

  const bgGrad = useMemo(() => ({ background: `linear-gradient(160deg, ${bg} 0%, #0d1b2a 50%, #1b2838 100%)` }), [bg]);
  const titleO = interpolate(frame, [0, 20], [0, 1], { extrapolateRight: 'clamp' });
  const titleY = interpolate(frame, [0, 25], [30, 0], { extrapolateRight: 'clamp' });
  const subO = interpolate(frame, [15, 35], [0, 1], { extrapolateRight: 'clamp' });
  const deviceS = interpolate(frame, [0, 30], [0.85, 1], { extrapolateRight: 'clamp' });
  const deviceR = interpolate(frame, [0, 30], [-5, 0], { extrapolateRight: 'clamp' });

  return (
    <AbsoluteFill style={{ backgroundColor: bg }}>
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, ...bgGrad }} />
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, opacity: 0.05, background: 'radial-gradient(circle at 80% 20%, #22d3ee, transparent 50%)' }} />
      {/* Grid overlay */}
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, opacity: 0.03, backgroundImage: 'linear-gradient(#22d3ee20 1px, transparent 1px), linear-gradient(90deg, #22d3ee20 1px, transparent 1px)', backgroundSize: '60px 60px' }} />

      <div style={{ position: 'relative', zIndex: 1, width: '100%', height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', padding: '60px', boxSizing: 'border-box' }}>
        {/* Device mockup */}
        {deviceImage && (
          <div style={{ width: 280, height: 190, borderRadius: 20, overflow: 'hidden', border: `2px solid ${accent}60`, boxShadow: `0 0 40px ${accent}30`, transform: `scale(${deviceS}) rotate(${deviceR}deg)`, marginBottom: 30 }}>
            <Img src={deviceImage} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          </div>
        )}
        {title && <h1 style={{ color: '#fff', fontSize: 52, fontWeight: 800, fontFamily: "'SF Pro', 'Inter', Arial, sans-serif", textAlign: 'center', margin: 0, marginBottom: 8, lineHeight: 1.1, opacity: titleO, transform: `translateY(${titleY}px)` }}>{title}</h1>}
        {subtitle && <p style={{ color: '#94a3b8', fontSize: 24, fontWeight: 400, fontFamily: "'SF Pro', 'Inter', Arial, sans-serif", textAlign: 'center', margin: 0, marginBottom: 16, opacity: subO }}>{subtitle}</p>}
        {/* Specs chips */}
        {specs.length > 0 && (
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', justifyContent: 'center', opacity: subO }}>
            {specs.map((s, i) => (
              <span key={i} style={{ backgroundColor: `${accent}20`, color: accent, fontSize: 16, fontWeight: 600, padding: '4px 14px', borderRadius: 20, border: `1px solid ${accent}40` }}>{s}</span>
            ))}
          </div>
        )}
      </div>
      <CaptionRenderer text={caption} animation="glowActive" animationConfig={{ glowColor: accent }} styleConfig={{ position: 'bottom', fontFamily: "'SF Pro', 'Inter', Arial, sans-serif", fontWeight: 600, fontSize: 34, textColor: '#ffffff', backgroundColor: 'rgba(0,0,0,0.6)', backgroundPadding: '12px 24px', borderRadius: 12, framesPerWord: 3 }} timestamps={timestamps} fps={fps} />
      {scene?.audio?.file && <Audio src={scene.audio.file} />}
    </AbsoluteFill>
  );
});
Template046.displayName = 'Template046';
export default Template046;
