import React, { useMemo } from 'react';
import { AbsoluteFill, Audio, Img, interpolate, useCurrentFrame, useVideoConfig } from 'remotion';
import { CaptionRenderer } from '../../captions/CaptionRenderer';

/**
 * Template 055 - Corporate
 * Professional, clean design with chart bars, metrics, and slide-right captions.
 * Caption animation: slideRight
 */
const Template055 = React.memo(({ scene }) => {
  const frame = useCurrentFrame(); const { fps } = useVideoConfig();
  const e = scene?.elements || {};
  const title = e.title || ''; const subtitle = e.subtitle || ''; const chartData = e.chartData || [];
  const caption = e.caption || ''; const timestamps = e.captionTimestamps || null;
  const bg = e.backgroundColor || '#0f172a'; const accent = e.accentColor || '#3b82f6';

  const bgGrad = useMemo(() => ({ background: `linear-gradient(160deg, ${bg} 0%, #1e293b 50%, ${bg} 100%)` }), [bg]);
  const titleO = interpolate(frame, [0, 18], [0, 1], { extrapolateRight: 'clamp' });
  const titleY = interpolate(frame, [0, 22], [25, 0], { extrapolateRight: 'clamp' });
  const subO = interpolate(frame, [14, 30], [0, 1], { extrapolateRight: 'clamp' });

  return (
    <AbsoluteFill style={{ backgroundColor: bg }}>
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, ...bgGrad }} />
      {/* Grid lines */}
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, opacity: 0.04, backgroundImage: 'linear-gradient(#fff 1px, transparent 1px), linear-gradient(90deg, #fff 1px, transparent 1px)', backgroundSize: '80px 80px' }} />

      <div style={{ position: 'relative', zIndex: 1, width: '100%', height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', padding: '60px', boxSizing: 'border-box' }}>
        {title && <h1 style={{ color: '#fff', fontSize: 48, fontWeight: 700, fontFamily: "'Inter', Arial, sans-serif", textAlign: 'center', margin: 0, marginBottom: 6, opacity: titleO, transform: `translateY(${titleY}px)` }}>{title}</h1>}
        {subtitle && <p style={{ color: '#94a3b8', fontSize: 22, fontWeight: 400, fontFamily: "'Inter', Arial, sans-serif", margin: 0, marginBottom: 30, opacity: subO }}>{subtitle}</p>}
        {/* Chart bars */}
        {chartData.length > 0 && (
          <div style={{ display: 'flex', gap: 20, alignItems: 'flex-end', height: 160, opacity: subO }}>
            {chartData.map((item, i) => {
              const barH = interpolate(frame, [15 + i * 3, 35 + i * 3], [0, item.value || 50], { extrapolateRight: 'clamp' });
              return (
                <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
                  <span style={{ color: accent, fontSize: 14, fontWeight: 600 }}>{item.label}</span>
                  <div style={{ width: 40, height: barH, backgroundColor: accent, borderRadius: '4px 4px 0 0', opacity: 0.8 + item.value / 200 }} />
                </div>
              );
            })}
          </div>
        )}
      </div>
      <CaptionRenderer text={caption} animation="slideRight" animationConfig={{ slideDistance: 25 }} styleConfig={{ position: 'bottom', fontFamily: "'Inter', Arial, sans-serif", fontWeight: 600, fontSize: 34, textColor: '#ffffff', backgroundColor: 'rgba(0,0,0,0.5)', backgroundPadding: '12px 24px', borderRadius: 8, framesPerWord: 3 }} timestamps={timestamps} fps={fps} />
      {scene?.audio?.file && <Audio src={scene.audio.file} />}
    </AbsoluteFill>
  );
});
Template055.displayName = 'Template055';
export default Template055;
