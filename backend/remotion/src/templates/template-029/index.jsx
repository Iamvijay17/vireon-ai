import React from 'react';
import { AbsoluteFill, Audio } from 'remotion';
import { backgroundColors } from '../../styles';
import { useFadeInOut, useSlideUp, usePop } from '../../animations';
import { mergeStyle, positionStyle } from '../../theme';

/**
 * Template 029 - Did You Know (Content)
 * Layout: Simple bold-statement content card with a lightbulb accent.
 *
 * JSON data format:
 * {
 *   templateId: "template-029",
 *   elements: {
 *     title: "string",
 *     body: "string",
 *     backgroundColor: "#hex" (optional)
 *   },
 *   audio: { file: "path" },
 *   duration: number
 * }
 */
const s = {
  container: { width: '100%', height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', padding: '60px 100px', boxSizing: 'border-box', position: 'relative', overflow: 'hidden', textAlign: 'center' },
  icon: { fontSize: 56, marginBottom: 20 },
  title: { color: '#fbbf24', fontSize: 30, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 2, marginBottom: 22 },
  body: { color: '#ffffff', fontSize: 42, fontWeight: 700, lineHeight: 1.35, maxWidth: '82%', margin: 0 },
};

const Template029 = React.memo(({ scene }) => {
  const e = scene?.elements || {};
  const title = e.title || '';
  const body = e.body || e.subtitle || '';
  const bgColor = e.backgroundColor || backgroundColors.dark;
  const overrides = e.styleConfig || {};

  const iconPop = usePop({ startAt: 3 });
  const titleFade = useFadeInOut({ fadeIn: 12, fadeInDuration: 12 });
  const bodySlide = useSlideUp({ startAt: 20, distance: 40 });

  return (
    <AbsoluteFill style={{ backgroundColor: bgColor }}>
      <div style={s.container}>
        <div style={{ ...s.icon, ...iconPop }}>&#128161;</div>
        {title && (
          <div style={mergeStyle({ ...s.title, opacity: titleFade, ...positionStyle(overrides.title?.position) }, overrides.title)}>
            {title}
          </div>
        )}
        {body && (
          <p style={mergeStyle({ ...s.body, ...bodySlide, ...positionStyle(overrides.subtitle?.position) }, overrides.subtitle)}>
            {body}
          </p>
        )}
      </div>
      {scene?.audio?.file && <Audio src={scene.audio.file} />}
    </AbsoluteFill>
  );
});

Template029.displayName = 'Template029';
export default Template029;
