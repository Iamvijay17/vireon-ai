import React from 'react';
import { AbsoluteFill, Audio } from 'remotion';
import { backgroundColors } from '../../styles';
import { useFadeInOut, usePop } from '../../animations';

/**
 * Template 015 - Feature Grid (Content)
 * Layout: Grid of content points, each with an icon, title, and description.
 *
 * JSON data format:
 * {
 *   templateId: "template-015",
 *   elements: {
 *     title: "string",
 *     items: [{ icon: "string", title: "string", description: "string" }],
 *     backgroundColor: "#hex" (optional)
 *   },
 *   audio: { file: "path" },
 *   duration: number
 * }
 */
const s = {
  container: { width: '100%', height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: '60px 80px', boxSizing: 'border-box', position: 'relative', overflow: 'hidden' },
  title: { color: '#ffffff', fontSize: 44, fontWeight: 'bold', textAlign: 'center', marginBottom: 34 },
  grid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 },
  card: { backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: 16, padding: '24px 26px', border: '1px solid rgba(255,255,255,0.08)' },
  icon: { fontSize: 32, marginBottom: 12 },
  cardTitle: { color: '#ffffff', fontSize: 21, fontWeight: 700, marginBottom: 6 },
  cardDesc: { color: '#94a3b8', fontSize: 16, lineHeight: 1.4 },
};

const GridItem = ({ item, index }) => {
  const pop = usePop({ startAt: 14 + index * 6 });
  return (
    <div style={{ ...s.card, ...pop }}>
      {item.icon && <div style={s.icon}>{item.icon}</div>}
      {item.title && <div style={s.cardTitle}>{item.title}</div>}
      {item.description && <div style={s.cardDesc}>{item.description}</div>}
    </div>
  );
};

const Template015 = React.memo(({ scene }) => {
  const elements = scene?.elements || {};
  const title = elements.title || '';
  const items = elements.items || elements.features || [];
  const bgColor = elements.backgroundColor || backgroundColors.dark;
  const titleFade = useFadeInOut({ fadeIn: 0, fadeInDuration: 12 });

  return (
    <AbsoluteFill style={{ backgroundColor: bgColor }}>
      <div style={s.container}>
        {title && <h1 style={{ ...s.title, opacity: titleFade }}>{title}</h1>}
        <div style={s.grid}>
          {items.map((item, index) => (
            <GridItem key={index} item={item} index={index} />
          ))}
        </div>
      </div>
      {scene?.audio?.file && <Audio src={scene.audio.file} />}
    </AbsoluteFill>
  );
});

Template015.displayName = 'Template015';
export default Template015;
