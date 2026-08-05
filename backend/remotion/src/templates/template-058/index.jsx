import React, { useMemo } from 'react';
import { AbsoluteFill, Audio, Img, interpolate, useCurrentFrame } from 'remotion';
import { backgroundColors } from '../../styles';
import { useFadeInOut } from '../../animations';

/**
 * Template 058 - Storytelling (Image)
 * Layout: Cinematic image-forward scene with a book/parchment aesthetic -
 * inset framed image, ornamental divider, caption below. Visually distinct
 * from the full-bleed vignette composition of template-021.
 *
 * JSON data format:
 * {
 *   templateId: "template-058",
 *   elements: {
 *     image: "url or path",
 *     caption: "string",
 *     label: "string" (optional, e.g. chapter marker),
 *     backgroundColor: "#hex" (optional)
 *   },
 *   audio: { file: "path" },
 *   duration: number
 * }
 */
const s = {
  container: { width: '100%', height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', padding: '70px 110px', boxSizing: 'border-box', position: 'relative', overflow: 'hidden' },
  label: { color: '#d4a574', fontSize: 16, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 6, marginBottom: 18 },
  frame: { position: 'relative', width: '68%', aspectRatio: '16 / 9', borderRadius: 6, overflow: 'hidden', border: '6px solid rgba(212,165,116,0.35)', boxShadow: '0 20px 60px rgba(0,0,0,0.5)', marginBottom: 26 },
  image: { width: '100%', height: '100%', objectFit: 'cover' },
  ornament: { color: '#d4a574', fontSize: 22, marginBottom: 16, letterSpacing: 8 },
  caption: { color: '#f5f0e8', fontSize: 24, fontWeight: 400, fontFamily: "'Playfair Display', 'Georgia', serif", textAlign: 'center', maxWidth: '70%', lineHeight: 1.6, fontStyle: 'italic', margin: 0 },
};

const Template058 = React.memo(({ scene }) => {
  const frame = useCurrentFrame();
  const elements = scene?.elements || {};
  const image = elements.image || '';
  const caption = elements.caption || elements.body || '';
  const label = elements.label || elements.chapter || '';
  const bgColor = elements.backgroundColor || '#1a1510';

  const bgGrad = useMemo(() => ({ background: `linear-gradient(180deg, ${bgColor} 0%, #2d2218 100%)` }), [bgColor]);
  const labelFade = useFadeInOut({ fadeIn: 0, fadeInDuration: 14 });
  const frameScale = interpolate(frame, [4, 26], [0.94, 1], { extrapolateRight: 'clamp' });
  const frameOpacity = interpolate(frame, [4, 24], [0, 1], { extrapolateRight: 'clamp' });
  const ornOpacity = interpolate(frame, [20, 32], [0, 1], { extrapolateRight: 'clamp' });
  const captionOpacity = interpolate(frame, [26, 46], [0, 1], { extrapolateRight: 'clamp' });

  return (
    <AbsoluteFill style={{ backgroundColor: bgColor }}>
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, ...bgGrad }} />
      <div style={s.container}>
        {label && <div style={{ ...s.label, opacity: labelFade }}>{label}</div>}
        <div style={{ ...s.frame, opacity: frameOpacity, transform: `scale(${frameScale})` }}>
          {image ? (
            <Img src={image} style={s.image} />
          ) : (
            <div style={{ ...s.image, backgroundColor: 'rgba(212,165,116,0.08)' }} />
          )}
        </div>
        <div style={{ ...s.ornament, opacity: ornOpacity }}>~ ~ ~</div>
        {caption && <p style={{ ...s.caption, opacity: captionOpacity }}>{caption}</p>}
      </div>
      {scene?.audio?.file && <Audio src={scene.audio.file} />}
    </AbsoluteFill>
  );
});

Template058.displayName = 'Template058';
export default Template058;
