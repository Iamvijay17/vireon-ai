import React, { useMemo } from 'react';
import { AbsoluteFill, Audio, Img, interpolate, useCurrentFrame, useVideoConfig } from 'remotion';
import { CaptionRenderer } from '../../captions/CaptionRenderer';

/**
 * Template 048 - Interview
 * Split-screen with guest/ host, name tags, and slide-right captions.
 * Caption animation: slideRight
 */
const Template048 = React.memo(({ scene }) => {
  const frame = useCurrentFrame(); const { fps } = useVideoConfig();
  const e = scene?.elements || {};
  const title = e.title || ''; const guestName = e.guestName || ''; const guestTitle = e.guestTitle || '';
  const guestImage = e.guestImage || ''; const caption = e.caption || '';
  const timestamps = e.captionTimestamps || null;
  const bg = e.backgroundColor || '#111827'; const accent = e.accentColor || '#60a5fa';

  const bgGrad = useMemo(() => ({ background: `linear-gradient(135deg, ${bg} 0%, #1e293b 50%, ${bg} 100%)` }), [bg]);
  const titleO = interpolate(frame, [0, 15], [0, 1], { extrapolateRight: 'clamp' });
  const titleY = interpolate(frame, [0, 20], [20, 0], { extrapolateRight: 'clamp' });
  const guestS = interpolate(frame, [0, 25], [0.9, 1], { extrapolateRight: 'clamp' });
  const guestB = interpolate(frame, [0, 25], [20, 0], { extrapolateRight: 'clamp' });
  const nameO = interpolate(frame, [15, 30], [0, 1], { extrapolateRight: 'clamp' });
  const micPulse = interpolate(Math.sin(frame * 0.12), [-1, 1], [1, 1.05]);

  return (
    <AbsoluteFill style={{ backgroundColor: bg }}>
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, ...bgGrad }} />
      <div style={{ position: 'relative', zIndex: 1, width: '100%', height: '100%', display: 'flex', flexDirection: 'column', padding: '60px', boxSizing: 'border-box' }}>
        {/* Top bar */}
        {title && <h1 style={{ color: '#fff', fontSize: 36, fontWeight: 700, fontFamily: "'Inter', Arial, sans-serif", margin: 0, marginBottom: 20, opacity: titleO, transform: `translateY(${titleY}px)` }}>{title}</h1>}

        {/* Split content */}
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 40 }}>
          {/* Guest card */}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', transform: `scale(${guestS}) translateY(${guestB}px)` }}>
            {guestImage && (
              <div style={{ width: 160, height: 160, borderRadius: '50%', overflow: 'hidden', border: `3px solid ${accent}`, boxShadow: `0 0 30px ${accent}40`, marginBottom: 16 }}>
                <Img src={guestImage} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              </div>
            )}
            {guestName && <h2 style={{ color: '#fff', fontSize: 32, fontWeight: 700, margin: 0, opacity: nameO, textAlign: 'center' }}>{guestName}</h2>}
            {guestTitle && <p style={{ color: accent, fontSize: 18, fontWeight: 500, margin: 0, opacity: nameO, textAlign: 'center' }}>{guestTitle}</p>}
          </div>

          {/* Mic indicator */}
          <div style={{ fontSize: 48, transform: `scale(${micPulse})`, opacity: nameO }}>🎙️</div>
        </div>
      </div>
      <CaptionRenderer text={caption} animation="slideRight" animationConfig={{ slideDistance: 30 }} styleConfig={{ position: 'bottom', fontFamily: "'Inter', Arial, sans-serif", fontWeight: 600, fontSize: 34, textColor: '#ffffff', backgroundColor: 'rgba(0,0,0,0.6)', backgroundPadding: '12px 24px', borderRadius: 10, framesPerWord: 3 }} timestamps={timestamps} fps={fps} />
      {scene?.audio?.file && <Audio src={scene.audio.file} />}
    </AbsoluteFill>
  );
});
Template048.displayName = 'Template048';
export default Template048;
