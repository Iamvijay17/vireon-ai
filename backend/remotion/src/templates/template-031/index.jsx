import React from 'react';
import { AbsoluteFill, Audio, interpolate, useCurrentFrame } from 'remotion';
import { backgroundColors } from '../../styles';
import { useFadeInOut, useZoomIn, usePop } from '../../animations';
import { mergeStyle, positionStyle } from '../../theme';

/**
 * Template 031 - Expert Quote (Outro)
 * Layout: Closing-scene layout distinct from Quote Testimonial - centered
 * composition with a radial glow behind the final message, badge above.
 *
 * JSON data format:
 * {
 *   templateId: "template-031",
 *   elements: {
 *     title: "string" (closing quote / message),
 *     body: "string" (attribution line),
 *     badge: "string" (optional, e.g. "Final Word"),
 *     backgroundColor: "#hex" (optional)
 *   },
 *   audio: { file: "path" },
 *   duration: number
 * }
 */
const s = {
  container: { width: '100%', height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', padding: '70px 100px', boxSizing: 'border-box', position: 'relative', overflow: 'hidden', textAlign: 'center' },
  glow: { position: 'absolute', top: '50%', left: '50%', width: 560, height: 560, borderRadius: '50%', background: 'radial-gradient(circle, rgba(167,139,250,0.22), transparent 70%)', transform: 'translate(-50%, -50%)' },
  badge: { position: 'relative', backgroundColor: 'rgba(167,139,250,0.15)', color: '#a78bfa', fontSize: 15, fontWeight: 700, padding: '8px 20px', borderRadius: 20, textTransform: 'uppercase', letterSpacing: 1.5, marginBottom: 26 },
  title: { position: 'relative', color: '#ffffff', fontSize: 44, fontWeight: 700, lineHeight: 1.3, maxWidth: '80%', margin: 0, marginBottom: 22 },
  divider: { position: 'relative', width: 44, height: 4, borderRadius: 2, backgroundColor: '#a78bfa', marginBottom: 18 },
  body: { position: 'relative', color: '#c4b5fd', fontSize: 20, fontWeight: 600, letterSpacing: 0.5 },
};

const Template031 = React.memo(({ scene }) => {
  const e = scene?.elements || {};
  const title = e.title || e.quote || '';
  const body = e.body || e.author || '';
  const badge = e.badge || '';
  const bgColor = e.backgroundColor || backgroundColors.navy;
  const overrides = e.styleConfig || {};

  const frame = useCurrentFrame();
  const bgFade = useFadeInOut({ fadeIn: 0, fadeInDuration: 12 });
  const glowScale = interpolate(frame, [0, 40], [0.7, 1], { extrapolateRight: 'clamp' });
  const badgePop = usePop({ startAt: 4 });
  const titleZoom = useZoomIn({ startAt: 10, duration: 20, from: 0.9, to: 1 });
  const dividerFade = useFadeInOut({ fadeIn: 26, fadeInDuration: 12 });
  const bodyFade = useFadeInOut({ fadeIn: 32, fadeInDuration: 14 });

  return (
    <AbsoluteFill style={{ backgroundColor: bgColor }}>
      <div style={{ ...s.container, opacity: bgFade }}>
        <div style={{ ...s.glow, transform: `translate(-50%, -50%) scale(${glowScale})` }} />
        {badge && <div style={{ ...s.badge, ...badgePop }}>{badge}</div>}
        {title && (
          <h1 style={mergeStyle({ ...s.title, opacity: titleZoom.opacity, transform: titleZoom.transform, ...positionStyle(overrides.title?.position) }, overrides.title)}>
            {title}
          </h1>
        )}
        <div style={{ ...s.divider, opacity: dividerFade }} />
        {body && <div style={{ ...s.body, opacity: bodyFade }}>{body}</div>}
      </div>
      {scene?.audio?.file && <Audio src={scene.audio.file} />}
    </AbsoluteFill>
  );
});

Template031.displayName = 'Template031';
export default Template031;
