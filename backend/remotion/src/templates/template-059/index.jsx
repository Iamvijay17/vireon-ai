import React, { useMemo } from 'react';
import { AbsoluteFill, Audio, Img, interpolate, useCurrentFrame, useVideoConfig } from 'remotion';
import { CaptionRenderer } from '../../captions/CaptionRenderer';

/**
 * Template 059 - Event
 * Conference/stage design with spotlight, speaker card, and fade-in-up captions.
 * Caption animation: fadeInUp
 */
const Template059 = React.memo(({ scene }) => {
  const frame = useCurrentFrame(); const { fps } = useVideoConfig();
  const e = scene?.elements || {};
  const title = e.title || ''; const speaker = e.speaker || ''; const date = e.date || '';
  const image = e.image || ''; const caption = e.caption || '';
  const timestamps = e.captionTimestamps || null;
  const bg = e.backgroundColor || '#0a0a0a'; const accent = e.accentColor || '#f59e0b';

  const bgGrad = useMemo(() => ({ background: `linear-gradient(180deg, ${bg} 0%, #1a1410 100%)` }), [bg]);
  const titleO = interpolate(frame, [0, 20], [0, 1], { extrapolateRight: 'clamp' });
  const titleY = interpolate(frame, [0, 25], [35, 0], { extrapolateRight: 'clamp' });
  const spO = interpolate(frame, [16, 35], [0, 1], { extrapolateRight: 'clamp' });
  const dateO = interpolate(frame, [25, 42], [0, 1], { extrapolateRight: 'clamp' });
  const spotX = interpolate(frame, [0, 30], [40, 50], { extrapolateRight: 'clamp' });
  const spotO = interpolate(frame, [0, 15], [0, 0.6], { extrapolateRight: 'clamp' });

  return (
    <AbsoluteFill style={{ backgroundColor: bg }}>
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, ...bgGrad }} />
      {/* Spotlight */}
      <div style={{ position: 'absolute', top: 0, left: `${spotX}%`, width: 400, height: '100%', background: `linear-gradient(180deg, ${accent}15, transparent)`, transform: 'translateX(-50%)', opacity: spotO, clipPath: 'polygon(40% 0%, 60% 0%, 80% 100%, 20% 100%)' }} />
      <div style={{ position: 'relative', zIndex: 1, width: '100%', height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', padding: '80px', boxSizing: 'border-box' }}>
        {image && <div style={{ width: 130, height: 130, borderRadius: '50%', overflow: 'hidden', border: `3px solid ${accent}`, boxShadow: `0 0 30px ${accent}30`, marginBottom: 20, transform: `scale(${interpolate(frame, [0, 25], [0.8, 1], {extrapolateRight: 'clamp'})})` }}><Img src={image} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /></div>}
        {title && <h1 style={{ color: '#fff', fontSize: 56, fontWeight: 800, fontFamily: "'Inter', Arial, sans-serif", textAlign: 'center', margin: 0, marginBottom: 8, opacity: titleO, transform: `translateY(${titleY}px)` }}>{title}</h1>}
        {speaker && <p style={{ color: accent, fontSize: 22, fontWeight: 600, fontFamily: "'Inter', Arial, sans-serif", margin: 0, marginBottom: 4, opacity: spO }}>{speaker}</p>}
        {date && <p style={{ color: '#9ca3af', fontSize: 18, fontWeight: 400, fontFamily: "'Inter', Arial, sans-serif", margin: 0, opacity: dateO }}>{date}</p>}
      </div>
      <CaptionRenderer text={caption} animation="fadeInUp" styleConfig={{ position: 'bottom', fontFamily: "'Inter', Arial, sans-serif", fontWeight: 600, fontSize: 34, textColor: '#ffffff', backgroundColor: 'rgba(0,0,0,0.6)', backgroundPadding: '12px 24px', borderRadius: 10, framesPerWord: 3 }} timestamps={timestamps} fps={fps} />
      {scene?.audio?.file && <Audio src={scene.audio.file} />}
    </AbsoluteFill>
  );
});
Template059.displayName = 'Template059';
export default Template059;
