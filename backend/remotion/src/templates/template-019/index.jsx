import React from 'react';
import { AbsoluteFill, Audio, Img } from 'remotion';
import { backgroundColors } from '../../styles';
import { useFadeInOut, useSlideUp, useZoomIn } from '../../animations';
import { mergeStyle, positionStyle } from '../../theme';

/**
 * Template 019 - Parallax Hero (Intro)
 * Layout: Full-bleed image with slow parallax zoom, overlaid title and subtitle.
 * An opening hero, not mid-video content.
 *
 * JSON data format:
 * {
 *   templateId: "template-019",
 *   elements: {
 *     title: "string",
 *     subtitle: "string",
 *     image: "url or path",
 *     backgroundColor: "#hex" (optional)
 *   },
 *   audio: { file: "path" },
 *   duration: number
 * }
 */
const s = {
  container: { width: '100%', height: '100%', position: 'relative', overflow: 'hidden' },
  parallaxLayer: { position: 'absolute', top: '-5%', left: '-5%', width: '110%', height: '110%' },
  parallaxImage: { width: '100%', height: '100%', objectFit: 'cover' },
  overlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, background: 'linear-gradient(180deg, rgba(0,0,0,0.35) 0%, rgba(0,0,0,0.35) 40%, rgba(0,0,0,0.8) 100%)' },
  content: { position: 'relative', zIndex: 1, width: '100%', height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', padding: '0 90px 100px', boxSizing: 'border-box' },
  title: { color: '#ffffff', fontSize: 66, fontWeight: 800, lineHeight: 1.1, margin: 0, marginBottom: 18, textShadow: '0 4px 24px rgba(0,0,0,0.5)' },
  subtitle: { color: '#e2e8f0', fontSize: 26, lineHeight: 1.5, maxWidth: '80%', margin: 0 },
};

const Template019 = React.memo(({ scene }) => {
  const elements = scene?.elements || {};
  const title = elements.title || '';
  const subtitle = elements.subtitle || '';
  const image = elements.image || '';
  const bgColor = elements.backgroundColor || backgroundColors.dark;
  const overrides = elements.styleConfig || {};

  const parallax = useZoomIn({ startAt: 0, duration: 100, from: 1, to: 1.15 });
  const bgFade = useFadeInOut({ fadeIn: 0, fadeInDuration: 15 });
  const titleSlide = useSlideUp({ startAt: 10, distance: 50 });
  const subtitleSlide = useSlideUp({ startAt: 20, distance: 35 });

  return (
    <AbsoluteFill style={{ backgroundColor: bgColor }}>
      <div style={s.container}>
        <div style={{ ...s.parallaxLayer, transform: parallax.transform }}>
          {image && <Img src={image} style={s.parallaxImage} />}
        </div>
        <div style={s.overlay} />
        <div style={{ ...s.content, opacity: bgFade }}>
          {title && (
            <h1 style={mergeStyle({ ...s.title, ...titleSlide, ...positionStyle(overrides.title?.position) }, overrides.title)}>
              {title}
            </h1>
          )}
          {subtitle && (
            <p style={mergeStyle({ ...s.subtitle, ...subtitleSlide, ...positionStyle(overrides.subtitle?.position) }, overrides.subtitle)}>
              {subtitle}
            </p>
          )}
        </div>
      </div>
      {scene?.audio?.file && <Audio src={scene.audio.file} />}
    </AbsoluteFill>
  );
});

Template019.displayName = 'Template019';
export default Template019;
