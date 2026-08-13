import React, { useMemo } from 'react';
import { AbsoluteFill, Audio, Img } from 'remotion';
import { backgroundColors } from '../../styles';
import { useFadeInOut, useSlideUp, useZoomIn } from '../../animations';
import { mergeStyle, positionStyle } from '../../theme';

/**
 * Template 012 - Hook Opener (Intro)
 * Layout: Bold hero-style opening scene. Large title punches in, subtitle
 * follows, optional image zooms in behind a dark gradient.
 *
 * JSON data format:
 * {
 *   templateId: "template-012",
 *   elements: {
 *     title: "string",
 *     subtitle: "string",
 *     image: "url or path" (optional),
 *     backgroundColor: "#hex" (optional)
 *   },
 *   audio: { file: "path" },
 *   duration: number
 * }
 */
const s = {
  container: { width: '100%', height: '100%', position: 'relative', overflow: 'hidden' },
  imageLayer: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  image: { width: '100%', height: '100%', objectFit: 'cover' },
  overlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, background: 'linear-gradient(180deg, rgba(10,10,20,0.55) 0%, rgba(10,10,20,0.85) 100%)' },
  content: { position: 'relative', zIndex: 1, width: '100%', height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', padding: '0 90px', boxSizing: 'border-box' },
  eyebrow: { width: 54, height: 5, borderRadius: 3, backgroundColor: '#60a5fa', marginBottom: 26 },
  title: { color: '#ffffff', fontSize: 76, fontWeight: 900, textAlign: 'center', lineHeight: 1.08, margin: 0, marginBottom: 22, textShadow: '0 6px 30px rgba(0,0,0,0.4)' },
  subtitle: { color: '#cbd5e1', fontSize: 28, textAlign: 'center', maxWidth: '75%', lineHeight: 1.5, margin: 0 },
};

const Template012 = React.memo(({ scene }) => {
  const elements = scene?.elements || {};
  const title = elements.title || '';
  const subtitle = elements.subtitle || '';
  const image = elements.image || '';
  const bgColor = elements.backgroundColor || backgroundColors.dark;
  const overrides = elements.styleConfig || {};

  const bgGradient = useMemo(() => ({
    background: `linear-gradient(135deg, ${bgColor} 0%, #16213e 55%, #0f3460 100%)`,
  }), [bgColor]);

  const eyebrowFade = useFadeInOut({ fadeIn: 0, fadeInDuration: 10 });
  const titlePop = useZoomIn({ startAt: 4, duration: 20, from: 0.85, to: 1 });
  const subtitleSlide = useSlideUp({ startAt: 22, distance: 35 });
  const imgZoom = useZoomIn({ startAt: 0, duration: 90, from: 1, to: 1.12 });

  return (
    <AbsoluteFill style={{ backgroundColor: bgColor }}>
      <div style={s.container}>
        {image ? (
          <div style={s.imageLayer}>
            <Img src={image} style={{ ...s.image, transform: imgZoom.transform }} />
          </div>
        ) : (
          <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, ...bgGradient }} />
        )}
        <div style={s.overlay} />
        <div style={s.content}>
          <div style={{ ...s.eyebrow, opacity: eyebrowFade }} />
          {title && <h1 style={mergeStyle({ ...s.title, opacity: titlePop.opacity, transform: titlePop.transform, ...positionStyle(overrides.title?.position) }, overrides.title)}>{title}</h1>}
          {subtitle && <p style={mergeStyle({ ...s.subtitle, ...subtitleSlide, ...positionStyle(overrides.subtitle?.position) }, overrides.subtitle)}>{subtitle}</p>}
        </div>
      </div>
      {scene?.audio?.file && <Audio src={scene.audio.file} />}
    </AbsoluteFill>
  );
});

Template012.displayName = 'Template012';
export default Template012;
