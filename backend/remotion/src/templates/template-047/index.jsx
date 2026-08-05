import React, { useMemo } from 'react';
import { AbsoluteFill, Audio, interpolate, useCurrentFrame } from 'remotion';
import { backgroundColors } from '../../styles';
import { useSlideUp } from '../../animations';

/**
 * Template 047 - Motivational (Outro)
 * Layout: Bold closing statement / call-to-action-style ending. Large
 * message punches in over a soft radial glow, supporting line follows.
 *
 * JSON data format:
 * {
 *   templateId: "template-047",
 *   elements: {
 *     title: "string",
 *     body: "string",
 *     backgroundColor: "#hex" (optional),
 *     accentColor: "#hex" (optional)
 *   },
 *   audio: { file: "path" },
 *   duration: number
 * }
 */
const Template047 = React.memo(({ scene }) => {
  const frame = useCurrentFrame();
  const e = scene?.elements || {};
  const title = e.title || e.quote || '';
  const body = e.body || e.author || '';
  const bg = e.backgroundColor || backgroundColors.warm;
  const accent = e.accentColor || '#fbbf24';

  const bgGrad = useMemo(() => ({ background: `linear-gradient(135deg, ${bg} 0%, #1a0f2e 50%, #2d1b4e 100%)` }), [bg]);
  const titleO = interpolate(frame, [0, 25], [0, 1], { extrapolateRight: 'clamp' });
  const titleScale = interpolate(frame, [0, 25], [0.9, 1], { extrapolateRight: 'clamp' });
  const accentLineX = interpolate(frame, [16, 30], [0, 1], { extrapolateRight: 'clamp' });
  const bodySlide = useSlideUp({ startAt: 26, distance: 30 });
  const glowY = interpolate(frame, [0, 90], [0, -30], { extrapolateRight: 'clamp' });

  return (
    <AbsoluteFill style={{ backgroundColor: bg }}>
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, ...bgGrad }} />
      <div style={{ position: 'absolute', top: '18%', left: '50%', width: 420, height: 420, borderRadius: '50%', background: `radial-gradient(circle, ${accent}18, transparent 70%)`, transform: `translate(-50%, ${glowY}px)` }} />
      <div style={{ position: 'relative', zIndex: 1, width: '100%', height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', padding: '80px 100px', boxSizing: 'border-box', textAlign: 'center' }}>
        {title && (
          <h1 style={{
            color: '#fff', fontSize: 54, fontWeight: 800, textAlign: 'center', margin: 0, marginBottom: 24,
            maxWidth: '85%', lineHeight: 1.25, opacity: titleO, transform: `scale(${titleScale})`,
          }}>{title}</h1>
        )}
        <div style={{ width: 64, height: 4, borderRadius: 2, backgroundColor: accent, transform: `scaleX(${accentLineX})`, marginBottom: 20 }} />
        {body && (
          <p style={{ color: accent, fontSize: 24, fontWeight: 600, letterSpacing: 0.5, maxWidth: '75%', lineHeight: 1.5, ...bodySlide }}>{body}</p>
        )}
      </div>
      {scene?.audio?.file && <Audio src={scene.audio.file} />}
    </AbsoluteFill>
  );
});
Template047.displayName = 'Template047';
export default Template047;
