import React from 'react';
import { AbsoluteFill, Audio } from 'remotion';
import { backgroundColors } from '../../styles';
import { useFadeInOut, useSlideLeft } from '../../animations';
import { mergeStyle, positionStyle } from '../../theme';

/**
 * Template 028 - Comparison Table (Content)
 * Layout: Generic two-column row list, each row pairing left/right content.
 *
 * JSON data format:
 * {
 *   templateId: "template-028",
 *   elements: {
 *     title: "string",
 *     items: [{ left: "string", right: "string" }],
 *     backgroundColor: "#hex" (optional)
 *   },
 *   audio: { file: "path" },
 *   duration: number
 * }
 */
const s = {
  container: { width: '100%', height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: '60px 90px', boxSizing: 'border-box', position: 'relative', overflow: 'hidden' },
  title: { color: '#ffffff', fontSize: 42, fontWeight: 'bold', textAlign: 'center', marginBottom: 30 },
  table: { display: 'flex', flexDirection: 'column', borderRadius: 16, overflow: 'hidden', border: '1px solid rgba(255,255,255,0.1)' },
  row: { display: 'flex', flexDirection: 'row' },
  cell: { flex: 1, padding: '18px 26px', fontSize: 19, color: '#e2e8f0' },
  cellLeft: { backgroundColor: 'rgba(255,255,255,0.04)', fontWeight: 600 },
  cellRight: { backgroundColor: 'rgba(96,165,250,0.06)', borderLeft: '1px solid rgba(255,255,255,0.08)' },
};

const Row = ({ item, index }) => {
  const rowSlide = useSlideLeft({ startAt: 14 + index * 6, distance: 50 });
  return (
    <div style={{ ...s.row, ...rowSlide, borderTop: index > 0 ? '1px solid rgba(255,255,255,0.08)' : 'none' }}>
      <div style={{ ...s.cell, ...s.cellLeft }}>{item.left}</div>
      <div style={{ ...s.cell, ...s.cellRight }}>{item.right}</div>
    </div>
  );
};

const Template028 = React.memo(({ scene }) => {
  const elements = scene?.elements || {};
  const title = elements.title || '';
  const items = elements.items || elements.rows || [];
  const bgColor = elements.backgroundColor || backgroundColors.navy;
  const overrides = elements.styleConfig || {};
  const titleFade = useFadeInOut({ fadeIn: 0, fadeInDuration: 12 });

  return (
    <AbsoluteFill style={{ backgroundColor: bgColor }}>
      <div style={s.container}>
        {title && (
          <h1 data-style-role="title" style={mergeStyle({ ...s.title, opacity: titleFade, ...positionStyle(overrides.title?.position) }, overrides.title)}>
            {title}
          </h1>
        )}
        <div style={s.table}>
          {items.map((item, index) => (
            <Row key={index} item={item} index={index} />
          ))}
        </div>
      </div>
      {scene?.audio?.file && <Audio src={scene.audio.file} />}
    </AbsoluteFill>
  );
});

Template028.displayName = 'Template028';
export default Template028;
