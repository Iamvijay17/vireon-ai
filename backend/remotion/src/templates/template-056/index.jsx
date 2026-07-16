import React, { useMemo } from 'react';
import { AbsoluteFill, Audio, Img, interpolate, useCurrentFrame, useVideoConfig } from 'remotion';
import { CaptionRenderer } from '../../captions/CaptionRenderer';

/**
 * Template 056 - Music
 * Album art showcase with waveform visualization and glow-active captions.
 * Caption animation: glowActive
 */
const Template056 = React.memo(({ scene }) => {
  const frame = useCurrentFrame(); const { fps } = useVideoConfig();
  const e = scene?.elements || {};
  const title = e.title || ''; const artist = e.artist || ''; const albumArt = e.albumArt || '';
  const caption = e.caption || ''; const timestamps = e.captionTimestamps || null;
  const bg = e.backgroundColor || '#0a0a1a'; const accent = e.accentColor || '#a855f7';

  const bgGrad = useMemo(() => ({ background: `linear-gradient(135deg, ${bg} 0%, #1a0a2e 50%, #0a0a1a 100%)` }), [bg]);
  const titleO = interpolate(frame, [0, 18], [0, 1], { extrapolateRight: 'clamp' });
  const titleY = interpolate(frame, [0, 22], [25, 0], { extrapolateRight: 'clamp' });
  const artS = interpolate(frame, [0, 25], [0.8, 1], { extrapolateRight: 'clamp' });
  const artR = interpolate(frame, [0, 60], [0, 360], { extrapolateRight: 'clamp' });
  const artistO = interpolate(frame, [14, 30], [0, 1], { extrapolateRight: 'clamp' });
  const vinylPulse = interpolate(Math.sin(frame * 0.05), [-1, 1], [0.8, 1]);

  // Waveform bars
  const bars = useMemo(() => Array.from({ length: 30 }, (_, i) => i), []);
  const getBarH = (i) => interpolate(Math.sin(frame * 0.1 + i * 0.4), [-1, 1], [4, 30]);

  return (
    <AbsoluteFill style={{ backgroundColor: bg }}>
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, ...bgGrad }} />
      <div style={{ position: 'relative', zIndex: 1, width: '100%', height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', padding: '60px', boxSizing: 'border-box' }}>
        {albumArt && (
          <div style={{ width: 180, height: 180, borderRadius: '50%', overflow: 'hidden', border: `3px solid ${accent}`, boxShadow: `0 0 50px ${accent}40, 0 0 100px ${accent}20`, transform: `scale(${artS * vinylPulse}) rotate(${artR}deg)`, marginBottom: 20 }}>
            <Img src={albumArt} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          </div>
        )}
        {title && <h1 style={{ color: '#fff', fontSize: 44, fontWeight: 800, fontFamily: "'Inter', Arial, sans-serif", textAlign: 'center', margin: 0, marginBottom: 4, opacity: titleO, transform: `translateY(${titleY}px)` }}>{title}</h1>}
        {artist && <p style={{ color: accent, fontSize: 20, fontWeight: 600, margin: 0, marginBottom: 20, opacity: artistO }}>{artist}</p>}
        {/* Waveform */}
        <div style={{ display: 'flex', gap: 3, alignItems: 'center', height: 30, opacity: artistO }}>
          {bars.map((_, i) => (
            <div key={i} style={{ width: 3, height: getBarH(i), borderRadius: 2, backgroundColor: accent, opacity: 0.7 }} />
          ))}
        </div>
      </div>
      <CaptionRenderer text={caption} animation="glowActive" animationConfig={{ glowColor: accent }} styleConfig={{ position: 'bottom', fontFamily: "'Inter', Arial, sans-serif", fontWeight: 700, fontSize: 34, textColor: '#ffffff', backgroundColor: 'rgba(0,0,0,0.6)', backgroundPadding: '12px 24px', borderRadius: 12, framesPerWord: 3 }} timestamps={timestamps} fps={fps} />
      {scene?.audio?.file && <Audio src={scene.audio.file} />}
    </AbsoluteFill>
  );
});
Template056.displayName = 'Template056';
export default Template056;
