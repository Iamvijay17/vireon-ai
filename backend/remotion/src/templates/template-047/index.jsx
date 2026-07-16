import React, { useMemo } from 'react';
import { AbsoluteFill, Audio, interpolate, useCurrentFrame, useVideoConfig } from 'remotion';
import { CaptionRenderer } from '../../captions/CaptionRenderer';

/**
 * Template 047 - Motivational
 * Bold typography, large quote, dramatic reveal with bounce captions.
 * Caption animation: bounce
 */
const Template047 = React.memo(({ scene }) => {
  const frame = useCurrentFrame(); const { fps } = useVideoConfig();
  const e = scene?.elements || {};
  const quote = e.quote || ''; const author = e.author || ''; const caption = e.caption || '';
  const timestamps = e.captionTimestamps || null;
  const bg = e.backgroundColor || '#0f0a1a'; const accent = e.accentColor || '#fbbf24';

  const bgGrad = useMemo(() => ({ background: `linear-gradient(135deg, ${bg} 0%, #1a0f2e 50%, #2d1b4e 100%)` }), [bg]);
  const quoteO = interpolate(frame, [0, 25], [0, 1], { extrapolateRight: 'clamp' });
  const quoteY = interpolate(frame, [0, 30], [50, 0], { extrapolateRight: 'clamp' });
  const authorO = interpolate(frame, [20, 40], [0, 1], { extrapolateRight: 'clamp' });
  const accentLineX = interpolate(frame, [5, 20], [0, 1], { extrapolateRight: 'clamp' });

  return (
    <AbsoluteFill style={{ backgroundColor: bg }}>
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, ...bgGrad }} />
      <div style={{ position: 'absolute', top: '20%', left: '10%', width: 300, height: 300, borderRadius: '50%', background: `radial-gradient(circle, ${accent}15, transparent)`, transform: `translateY(${interpolate(frame, [0, 60], [0, -30], {extrapolateRight: 'clamp'})}px)` }} />
      <div style={{ position: 'relative', zIndex: 1, width: '100%', height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', padding: '80px', boxSizing: 'border-box' }}>
        {/* Large opening quote mark */}
        <div style={{ color: accent, fontSize: 120, fontWeight: 900, fontFamily: 'Georgia, serif', lineHeight: 1, opacity: quoteO, marginBottom: -20 }}>"</div>
        {quote && <p style={{ color: '#fff', fontSize: 48, fontWeight: 700, fontFamily: "'Inter', 'Helvetica Neue', Arial, sans-serif", textAlign: 'center', margin: 0, marginBottom: 20, maxWidth: '80%', lineHeight: 1.3, fontStyle: 'italic', opacity: quoteO, transform: `translateY(${quoteY}px)` }}>{quote}</p>}
        <div style={{ width: 60, height: 3, borderRadius: 2, backgroundColor: accent, transform: `scaleX(${accentLineX})`, marginBottom: 16 }} />
        {author && <p style={{ color: accent, fontSize: 22, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 3, opacity: authorO }}>{author}</p>}
      </div>
      <CaptionRenderer text={caption} animation="bounce" styleConfig={{ position: 'bottom', fontFamily: "'Inter', 'Helvetica Neue', Arial, sans-serif", fontWeight: 700, fontSize: 36, textColor: '#ffffff', backgroundColor: 'rgba(0,0,0,0.5)', backgroundPadding: '14px 28px', borderRadius: 12, framesPerWord: 4 }} timestamps={timestamps} fps={fps} />
      {scene?.audio?.file && <Audio src={scene.audio.file} />}
    </AbsoluteFill>
  );
});
Template047.displayName = 'Template047';
export default Template047;
