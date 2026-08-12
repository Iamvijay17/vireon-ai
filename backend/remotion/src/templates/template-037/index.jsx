import React from 'react';
import { AbsoluteFill, Audio } from 'remotion';
import { backgroundColors } from '../../styles';
import { useFadeInOut, useSlideUp } from '../../animations';

/**
 * Template 037 - Milestones (Content)
 * Layout: Single-column vertical list with big numbered markers and a left
 * connecting rail. Visually distinct from the alternating flow of
 * template-004 (Timeline).
 *
 * JSON data format:
 * {
 *   templateId: "template-037",
 *   elements: {
 *     title: "string",
 *     items: [{ heading: "string", text: "string" }],
 *     backgroundColor: "#hex" (optional)
 *   },
 *   audio: { file: "path" },
 *   duration: number
 * }
 */
const s = {
  container: { width: '100%', height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: '60px 90px', boxSizing: 'border-box', position: 'relative', overflow: 'hidden' },
  title: { color: '#ffffff', fontSize: 42, fontWeight: 'bold', marginBottom: 34 },
  list: { position: 'relative', display: 'flex', flexDirection: 'column', gap: 8, paddingLeft: 40 },
  rail: { position: 'absolute', top: 10, bottom: 10, left: 19, width: 2, backgroundColor: 'rgba(251,191,36,0.3)' },
  row: { display: 'flex', flexDirection: 'row', alignItems: 'flex-start', gap: 20, padding: '14px 0' },
  num: { position: 'absolute', left: -40, width: 40, display: 'flex', justifyContent: 'center', color: '#fbbf24', fontSize: 22, fontWeight: 800 },
  heading: { color: '#ffffff', fontSize: 23, fontWeight: 700, marginBottom: 4 },
  text: { color: '#94a3b8', fontSize: 17, lineHeight: 1.35 },
};

const ListItem = ({ item, index, frameOffset }) => {
  const rowSlide = useSlideUp({ startAt: frameOffset + index * 8, distance: 30 });
  return (
    <div style={{ ...s.row, ...rowSlide, position: 'relative' }}>
      <div style={s.num}>{String(index + 1).padStart(2, '0')}</div>
      <div>
        {item.heading && <div style={s.heading}>{item.heading}</div>}
        {item.text && <div style={s.text}>{item.text}</div>}
      </div>
    </div>
  );
};

const Template037 = React.memo(({ scene }) => {
  const e = scene?.elements || {};
  const title = e.title || '';
  const items = e.items || [];
  const bgColor = e.backgroundColor || backgroundColors.dark;
  const titleFade = useFadeInOut({ fadeIn: 0, fadeInDuration: 12 });

  return (
    <AbsoluteFill style={{ backgroundColor: bgColor }}>
      <div style={s.container}>
        {title && <h1 style={{ ...s.title, opacity: titleFade }}>{title}</h1>}
        <div style={s.list}>
          <div style={s.rail} />
          {items.map((item, index) => (
            <ListItem key={index} item={item} index={index} frameOffset={14} />
          ))}
        </div>
      </div>
      {scene?.audio?.file && <Audio src={scene.audio.file} />}
    </AbsoluteFill>
  );
});

Template037.displayName = 'Template037';
export default Template037;
