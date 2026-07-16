import React, { useMemo } from 'react';
import { AbsoluteFill, Audio, Img, interpolate, useCurrentFrame, useVideoConfig } from 'remotion';
import { CaptionRenderer } from '../../captions/CaptionRenderer';

/**
 * Template 054 - Educational
 * Classroom/chalkboard style with formula cards and highlight captions.
 * Caption animation: highlightCurrent
 */
const Template054 = React.memo(({ scene }) => {
  const frame = useCurrentFrame(); const { fps } = useVideoConfig();
  const e = scene?.elements || {};
  const title = e.title || ''; const formula = e.formula || ''; const caption = e.caption || '';
  const timestamps = e.captionTimestamps || null;
  const bg = e.backgroundColor || '#0a1a0a'; const accent = e.accentColor || '#34d399';

  const boardBg = useMemo(() => ({ background: `linear-gradient(135deg, ${bg} 0%, #0f2a0f 50%, #0a1a0a 100%)` }), [bg]);
  const titleO = interpolate(frame, [0, 20], [0, 1], { extrapolateRight: 'clamp' });
  const titleY = interpolate(frame, [0, 25], [30, 0], { extrapolateRight: 'clamp' });
  const formulaO = interpolate(frame, [10, 30], [0, 1], { extrapolateRight: 'clamp' });
  const formulaS = interpolate(frame, [10, 30], [0.8, 1], { extrapolateRight: 'clamp' });
  const chalkDust = interpolate(Math.sin(frame * 0.2), [-1, 1], [0.02, 0.05]);

  return (
    <AbsoluteFill style={{ backgroundColor: bg }}>
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, ...boardBg }} />
      {/* Chalk dust overlay */}
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, opacity: chalkDust, backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.8' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)'/%3E%3C/svg%3E")` }} />
      {/* Chalk board border */}
      <div style={{ position: 'absolute', top: 20, left: 20, right: 20, bottom: 20, border: `2px solid ${accent}20`, borderRadius: 8, pointerEvents: 'none' }} />

      <div style={{ position: 'relative', zIndex: 1, width: '100%', height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', padding: '80px', boxSizing: 'border-box' }}>
        {title && <h1 style={{ color: '#fff', fontSize: 52, fontWeight: 700, fontFamily: "'Courier New', monospace", textAlign: 'center', margin: 0, marginBottom: 24, opacity: titleO, transform: `translateY(${titleY}px)`, textShadow: `0 0 20px ${accent}20` }}>{title}</h1>}
        {formula && (
          <div style={{ backgroundColor: 'rgba(255,255,255,0.05)', border: `1px solid ${accent}30`, borderRadius: 12, padding: '20px 40px', marginBottom: 16, opacity: formulaO, transform: `scale(${formulaS})` }}>
            <span style={{ color: accent, fontSize: 36, fontWeight: 700, fontFamily: "'Courier New', monospace", letterSpacing: 2 }}>{formula}</span>
          </div>
        )}
      </div>
      <CaptionRenderer text={caption} animation="highlightCurrent" animationConfig={{ highlightColor: accent }} styleConfig={{ position: 'bottom', fontFamily: "'Courier New', monospace", fontWeight: 600, fontSize: 30, textColor: '#ffffff', backgroundColor: 'rgba(0,0,0,0.6)', backgroundPadding: '12px 24px', borderRadius: 8, framesPerWord: 3 }} timestamps={timestamps} fps={fps} />
      {scene?.audio?.file && <Audio src={scene.audio.file} />}
    </AbsoluteFill>
  );
});
Template054.displayName = 'Template054';
export default Template054;
