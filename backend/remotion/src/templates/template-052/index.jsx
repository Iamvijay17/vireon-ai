import React, { useMemo } from 'react';
import { AbsoluteFill, Audio, Img, interpolate, useCurrentFrame, useVideoConfig } from 'remotion';
import { CaptionRenderer } from '../../captions/CaptionRenderer';

/**
 * Template 052 - Cooking/Food
 * Warm, appetizing design with recipe card, ingredients, and slide-up captions.
 * Caption animation: fadeInUp
 */
const Template052 = React.memo(({ scene }) => {
  const frame = useCurrentFrame(); const { fps } = useVideoConfig();
  const e = scene?.elements || {};
  const title = e.title || ''; const subtitle = e.subtitle || ''; const image = e.image || '';
  const ingredients = e.ingredients || []; const caption = e.caption || '';
  const timestamps = e.captionTimestamps || null;
  const bg = e.backgroundColor || '#1a1410'; const accent = e.accentColor || '#f59e0b';

  const bgGrad = useMemo(() => ({ background: `linear-gradient(180deg, ${bg} 0%, #2d2010 100%)` }), [bg]);
  const titleO = interpolate(frame, [0, 15], [0, 1], { extrapolateRight: 'clamp' });
  const titleY = interpolate(frame, [0, 20], [25, 0], { extrapolateRight: 'clamp' });
  const imgS = interpolate(frame, [5, 25], [0.9, 1], { extrapolateRight: 'clamp' });
  const imgR = interpolate(frame, [5, 25], [8, 0], { extrapolateRight: 'clamp' });
  const subO = interpolate(frame, [14, 30], [0, 1], { extrapolateRight: 'clamp' });
  const steamY = interpolate(Math.sin(frame * 0.1), [-1, 1], [0, -10]);

  return (
    <AbsoluteFill style={{ backgroundColor: bg }}>
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, ...bgGrad }} />
      <div style={{ position: 'relative', zIndex: 1, width: '100%', height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', padding: '60px', boxSizing: 'border-box' }}>
        {image && (
          <div style={{ width: 220, height: 220, borderRadius: 20, overflow: 'hidden', boxShadow: `0 10px 40px rgba(0,0,0,0.5)`, border: `3px solid ${accent}60`, transform: `scale(${imgS}) rotate(${imgR}deg)`, marginBottom: 24 }}>
            <Img src={image} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            {/* Steam effect */}
            <div style={{ position: 'absolute', top: -10, left: '30%', width: 20, height: 20, backgroundColor: '#ffffff10', borderRadius: '50%', filter: 'blur(8px)', transform: `translateY(${steamY}px)` }} />
          </div>
        )}
        {title && <h1 style={{ color: '#fff', fontSize: 52, fontWeight: 800, fontFamily: "'Georgia', serif", textAlign: 'center', margin: 0, marginBottom: 6, opacity: titleO, transform: `translateY(${titleY}px)` }}>{title}</h1>}
        {subtitle && <p style={{ color: accent, fontSize: 20, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 2, margin: 0, marginBottom: 16, opacity: subO }}>{subtitle}</p>}
        {/* Ingredients */}
        {ingredients.length > 0 && (
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'center', opacity: subO }}>
            {ingredients.map((ing, i) => (
              <span key={i} style={{ backgroundColor: 'rgba(255,255,255,0.08)', color: '#d1d5db', fontSize: 16, padding: '4px 14px', borderRadius: 20, border: `1px solid rgba(255,255,255,0.12)` }}>{ing}</span>
            ))}
          </div>
        )}
      </div>
      <CaptionRenderer text={caption} animation="fadeInUp" animationConfig={{ slideDistance: 12 }} styleConfig={{ position: 'bottom', fontFamily: "'Georgia', serif", fontWeight: 600, fontSize: 34, textColor: '#ffffff', backgroundColor: 'rgba(0,0,0,0.6)', backgroundPadding: '12px 24px', borderRadius: 12, framesPerWord: 3 }} timestamps={timestamps} fps={fps} />
      {scene?.audio?.file && <Audio src={scene.audio.file} />}
    </AbsoluteFill>
  );
});
Template052.displayName = 'Template052';
export default Template052;
