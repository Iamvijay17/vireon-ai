import React, { useMemo } from 'react';
import { AbsoluteFill, Audio, Img, interpolate, useCurrentFrame, useVideoConfig } from 'remotion';
import { CaptionRenderer } from '../../captions/CaptionRenderer';

/**
 * Template 053 - Travel
 * Wanderlust aesthetic with polaroid-style image, location pin, and slide-left captions.
 * Caption animation: slideLeft
 */
const Template053 = React.memo(({ scene }) => {
  const frame = useCurrentFrame(); const { fps } = useVideoConfig();
  const e = scene?.elements || {};
  const title = e.title || ''; const location = e.location || ''; const image = e.image || '';
  const caption = e.caption || ''; const timestamps = e.captionTimestamps || null;
  const bg = e.backgroundColor || '#0a1628'; const accent = e.accentColor || '#22d3ee';

  const bgGrad = useMemo(() => ({ background: `linear-gradient(180deg, ${bg} 0%, #0f2847 100%)` }), [bg]);
  const titleO = interpolate(frame, [0, 18], [0, 1], { extrapolateRight: 'clamp' });
  const titleY = interpolate(frame, [0, 22], [30, 0], { extrapolateRight: 'clamp' });
  const imgS = interpolate(frame, [5, 30], [0.8, 1], { extrapolateRight: 'clamp' });
  const imgR = interpolate(frame, [5, 30], [6, 1], { extrapolateRight: 'clamp' });
  const locO = interpolate(frame, [12, 28], [0, 1], { extrapolateRight: 'clamp' });
  const pinBounce = interpolate(Math.sin(frame * 0.12), [-1, 1], [0, -6]);

  return (
    <AbsoluteFill style={{ backgroundColor: bg }}>
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, ...bgGrad }} />
      {/* Map dots */}
      <div style={{ position: 'absolute', bottom: '25%', right: '8%', width: 8, height: 8, borderRadius: '50%', backgroundColor: accent, opacity: 0.3 }} />
      <div style={{ position: 'absolute', bottom: '30%', right: '15%', width: 5, height: 5, borderRadius: '50%', backgroundColor: accent, opacity: 0.2 }} />
      <div style={{ position: 'absolute', bottom: '20%', right: '20%', width: 6, height: 6, borderRadius: '50%', backgroundColor: accent, opacity: 0.25 }} />

      <div style={{ position: 'relative', zIndex: 1, width: '100%', height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', padding: '60px', boxSizing: 'border-box' }}>
        {image && (
          <div style={{ padding: 12, backgroundColor: '#fff', borderRadius: 4, boxShadow: '0 8px 30px rgba(0,0,0,0.4)', transform: `scale(${imgS}) rotate(${imgR}deg)`, marginBottom: 24 }}>
            <Img src={image} style={{ width: 260, height: 180, objectFit: 'cover', borderRadius: 2 }} />
          </div>
        )}
        {location && <p style={{ color: accent, fontSize: 18, fontWeight: 600, margin: 0, marginBottom: 4, opacity: locO, transform: `translateY(${pinBounce}px)` }}>📍 {location}</p>}
        {title && <h1 style={{ color: '#fff', fontSize: 48, fontWeight: 700, fontFamily: "'Inter', Arial, sans-serif", textAlign: 'center', margin: 0, opacity: titleO, transform: `translateY(${titleY}px)` }}>{title}</h1>}
      </div>
      <CaptionRenderer text={caption} animation="slideLeft" animationConfig={{ slideDistance: 35 }} styleConfig={{ position: 'bottom', fontFamily: "'Inter', Arial, sans-serif", fontWeight: 600, fontSize: 34, textColor: '#ffffff', backgroundColor: 'rgba(0,0,0,0.5)', backgroundPadding: '12px 24px', borderRadius: 10, framesPerWord: 3 }} timestamps={timestamps} fps={fps} />
      {scene?.audio?.file && <Audio src={scene.audio.file} />}
    </AbsoluteFill>
  );
});
Template053.displayName = 'Template053';
export default Template053;
