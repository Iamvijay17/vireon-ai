import React from 'react';
import { AbsoluteFill, Audio, Img, interpolate, useCurrentFrame, useVideoConfig } from 'remotion';
import { backgroundColors } from '../../styles';
import { useFadeInOut, useSlideUp } from '../../animations';

/**
 * Template 021 - Vignette Story (Image)
 * Layout: Cinematic full-bleed image with a radial vignette, small label,
 * and caption. Matches the template-003 / template-045 image-forward
 * conventions.
 *
 * JSON data format:
 * {
 *   templateId: "template-021",
 *   elements: {
 *     image: "url or path",
 *     caption: "string",
 *     label: "string" (optional),
 *     backgroundColor: "#hex" (optional)
 *   },
 *   audio: { file: "path" },
 *   duration: number
 * }
 */
const s = {
  container: { width: '100%', height: '100%', position: 'relative', overflow: 'hidden' },
  image: { width: '100%', height: '100%', objectFit: 'cover' },
  vignette: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, background: 'radial-gradient(ellipse at center, transparent 45%, rgba(0,0,0,0.88) 100%)' },
  content: { position: 'absolute', bottom: 0, left: 0, right: 0, padding: '0 90px 90px', boxSizing: 'border-box', display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' },
  accentLine: { width: 60, height: 3, borderRadius: 2, backgroundColor: '#fbbf24', marginBottom: 18 },
  label: { color: '#fbbf24', fontSize: 16, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 3, marginBottom: 10 },
  caption: { color: '#f5f5f0', fontSize: 30, fontWeight: 500, lineHeight: 1.4, maxWidth: '80%', margin: 0 },
};

const Template021 = React.memo(({ scene }) => {
  const elements = scene?.elements || {};
  const image = elements.image || '';
  const caption = elements.caption || elements.body || '';
  const label = elements.label || '';
  const bgColor = elements.backgroundColor || backgroundColors.dark;

  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  const zoomScale = interpolate(frame, [0, durationInFrames || 120], [1, 1.1], { extrapolateRight: 'clamp' });
  const bgFade = useFadeInOut({ fadeIn: 0, fadeInDuration: 15 });
  const lineFade = useFadeInOut({ fadeIn: 10, fadeInDuration: 15 });
  const labelFade = useFadeInOut({ fadeIn: 14, fadeInDuration: 15 });
  const captionSlide = useSlideUp({ startAt: 18, distance: 40 });

  return (
    <AbsoluteFill style={{ backgroundColor: bgColor }}>
      <div style={s.container}>
        {image && (
          <Img src={image} style={{ ...s.image, transform: `scale(${zoomScale})` }} />
        )}
        <div style={{ ...s.vignette, opacity: bgFade }} />
        <div style={s.content}>
          <div style={{ ...s.accentLine, opacity: lineFade }} />
          {label && <div style={{ ...s.label, opacity: labelFade }}>{label}</div>}
          {caption && <p style={{ ...s.caption, ...captionSlide }}>{caption}</p>}
        </div>
      </div>
      {scene?.audio?.file && <Audio src={scene.audio.file} />}
    </AbsoluteFill>
  );
});

Template021.displayName = 'Template021';
export default Template021;
