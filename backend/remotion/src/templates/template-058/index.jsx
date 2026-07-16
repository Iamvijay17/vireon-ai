import React, { useMemo } from 'react';
import { AbsoluteFill, Audio, interpolate, useCurrentFrame, useVideoConfig } from 'remotion';
import { CaptionRenderer } from '../../captions/CaptionRenderer';

/**
 * Template 058 - Storytelling
 * Book/magazine aesthetic with parchment tones, decorative elements, and typewriter captions.
 * Caption animation: typewriter
 */
const Template058 = React.memo(({ scene }) => {
  const frame = useCurrentFrame(); const { fps } = useVideoConfig();
  const e = scene?.elements || {};
  const title = e.title || ''; const body = e.body || ''; const chapter = e.chapter || '';
  const caption = e.caption || ''; const timestamps = e.captionTimestamps || null;
  const bg = e.backgroundColor || '#1a1510'; const accent = e.accentColor || '#d4a574';

  const bgGrad = useMemo(() => ({ background: `linear-gradient(180deg, ${bg} 0%, #2d2218 100%)` }), [bg]);
  const titleO = interpolate(frame, [0, 25], [0, 1], { extrapolateRight: 'clamp' });
  const titleY = interpolate(frame, [0, 30], [35, 0], { extrapolateRight: 'clamp' });
  const bodyO = interpolate(frame, [20, 45], [0, 1], { extrapolateRight: 'clamp' });
  const chapO = interpolate(frame, [0, 15], [0, 1], { extrapolateRight: 'clamp' });
  const pageFlip = interpolate(frame, [0, 15], [0, 1], { extrapolateRight: 'clamp' });
  const ornO = interpolate(frame, [8, 20], [0, 1], { extrapolateRight: 'clamp' });

  return (
    <AbsoluteFill style={{ backgroundColor: bg }}>
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, ...bgGrad }} />
      {/* Page curl effect */}
      <div style={{ position: 'absolute', bottom: 0, right: 0, width: 60, height: 60, background: 'linear-gradient(135deg, transparent 50%, rgba(255,255,255,0.03) 50%)', transform: `scaleX(${pageFlip})`, transformOrigin: 'bottom right' }} />
      <div style={{ position: 'relative', zIndex: 1, width: '100%', height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', padding: '80px 100px 160px', boxSizing: 'border-box' }}>
        {chapter && <p style={{ color: accent, fontSize: 16, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 6, margin: 0, marginBottom: 16, opacity: chapO }}>{chapter}</p>}
        {/* Ornament */}
        <div style={{ color: accent, fontSize: 24, opacity: ornO, marginBottom: 12 }}>~ ~ ~</div>
        {title && <h1 style={{ color: '#f5f0e8', fontSize: 56, fontWeight: 400, fontFamily: "'Playfair Display', 'Georgia', serif", textAlign: 'center', margin: 0, marginBottom: 20, lineHeight: 1.2, opacity: titleO, transform: `translateY(${titleY}px)` }}>{title}</h1>}
        {body && <p style={{ color: '#c4b8a8', fontSize: 24, fontWeight: 400, fontFamily: "'Playfair Display', 'Georgia', serif", textAlign: 'center', margin: 0, maxWidth: '75%', lineHeight: 1.6, fontStyle: 'italic', opacity: bodyO }}>{body}</p>}
      </div>
      <CaptionRenderer text={caption} animation="typewriter" styleConfig={{ position: 'bottom', fontFamily: "'Playfair Display', 'Georgia', serif", fontWeight: 600, fontSize: 30, textColor: '#f5f0e8', backgroundColor: 'rgba(0,0,0,0.5)', backgroundPadding: '12px 24px', borderRadius: 8, framesPerWord: 4 }} timestamps={timestamps} fps={fps} />
      {scene?.audio?.file && <Audio src={scene.audio.file} />}
    </AbsoluteFill>
  );
});
Template058.displayName = 'Template058';
export default Template058;
