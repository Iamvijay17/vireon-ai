import React from 'react';
import { AbsoluteFill, Audio } from 'remotion';
import { backgroundColors } from '../../styles';
import { mergeStyle, positionStyle } from '../../theme';
import { useFadeInOut, usePop } from '../../animations';

/**
 * Template 033 - Benefits Row (Content)
 * Layout: Horizontal row of content highlights, each an icon + short text.
 *
 * JSON data format:
 * {
 *   templateId: "template-033",
 *   elements: {
 *     title: "string",
 *     items: [{ icon: "string", text: "string" }],
 *     backgroundColor: "#hex" (optional)
 *   },
 *   audio: { file: "path" },
 *   duration: number
 * }
 */
const s = {
  container: { width: '100%', height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', padding: '60px 70px', boxSizing: 'border-box', position: 'relative', overflow: 'hidden' },
  title: { color: '#ffffff', fontSize: 42, fontWeight: 'bold', textAlign: 'center', marginBottom: 44 },
  row: { display: 'flex', flexDirection: 'row', gap: 24, justifyContent: 'center', flexWrap: 'wrap' },
  item: { display: 'flex', flexDirection: 'column', alignItems: 'center', width: 190, backgroundColor: 'rgba(255,255,255,0.04)', borderRadius: 16, padding: '26px 16px', border: '1px solid rgba(255,255,255,0.08)' },
  icon: { fontSize: 40, marginBottom: 14 },
  text: { color: '#e2e8f0', fontSize: 18, fontWeight: 600, textAlign: 'center', lineHeight: 1.3 },
};

const RowItem = ({ item, index }) => {
  const pop = usePop({ startAt: 14 + index * 6 });
  return (
    <div style={{ ...s.item, ...pop }}>
      {item.icon && <div style={s.icon}>{item.icon}</div>}
      {item.text && <div style={s.text}>{item.text}</div>}
    </div>
  );
};

const Template033 = React.memo(({ scene }) => {
  const e = scene?.elements || {};
  const title = e.title || '';
  const items = e.items || [];
  const bgColor = e.backgroundColor || backgroundColors.slate;
  const overrides = e.styleConfig || {};
  const titleFade = useFadeInOut({ fadeIn: 0, fadeInDuration: 12 });

  return (
    <AbsoluteFill style={{ backgroundColor: bgColor }}>
      <div style={s.container}>
        {title && <h1 data-style-role="title" style={mergeStyle({ ...s.title, ...positionStyle(overrides.title?.position), opacity: titleFade }, overrides.title)}>{title}</h1>}
        <div style={s.row}>
          {items.map((item, index) => (
            <RowItem key={index} item={item} index={index} />
          ))}
        </div>
      </div>
      {scene?.audio?.file && <Audio src={scene.audio.file} />}
    </AbsoluteFill>
  );
});

Template033.displayName = 'Template033';
export default Template033;
