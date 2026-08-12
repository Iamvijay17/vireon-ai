import React from 'react';
import { AbsoluteFill, Audio, Sequence, useCurrentFrame, useVideoConfig } from 'remotion';
import { backgroundColors } from '../../styles';
import { useFadeInOut, useSlideLeft, useSlideRight } from '../../animations';

/**
 * Template 004 - Timeline (Content)
 * Layout: Alternating left/right cards flowing down a central connector line.
 * Generic sequential content points, not dated events.
 *
 * JSON data format:
 * {
 *   templateId: "template-004",
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
  container: { width: '100%', height: '100%', display: 'flex', flexDirection: 'column', padding: '60px 90px', boxSizing: 'border-box', position: 'relative', overflow: 'hidden' },
  title: { color: '#ffffff', fontSize: 44, fontWeight: 'bold', textAlign: 'center', marginBottom: 30 },
  flow: { position: 'relative', flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 22 },
  line: { position: 'absolute', top: 0, bottom: 0, left: '50%', width: 2, backgroundColor: 'rgba(96,165,250,0.3)', transform: 'translateX(-50%)' },
  row: { display: 'flex', width: '100%', position: 'relative', zIndex: 1 },
  rowLeft: { justifyContent: 'flex-start' },
  rowRight: { justifyContent: 'flex-end' },
  dot: { position: 'absolute', top: '50%', left: '50%', width: 16, height: 16, borderRadius: '50%', backgroundColor: '#60a5fa', transform: 'translate(-50%, -50%)', boxShadow: '0 0 0 6px rgba(96,165,250,0.15)' },
  card: { width: '44%', backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: 14, padding: '18px 22px', border: '1px solid rgba(255,255,255,0.08)' },
  heading: { color: '#60a5fa', fontSize: 20, fontWeight: 700, marginBottom: 6 },
  text: { color: '#cbd5e1', fontSize: 17, lineHeight: 1.4 },
};

const FlowItem = ({ item, index, frameOffset }) => {
  const isLeft = index % 2 === 0;
  const startAt = frameOffset + 12 + index * 10;
  const leftAnim = useSlideLeft({ startAt, distance: 60 });
  const rightAnim = useSlideRight({ startAt, distance: 60 });
  const cardAnim = isLeft ? leftAnim : rightAnim;
  const dotFade = useFadeInOut({ fadeIn: startAt - 4, fadeInDuration: 10 });

  return (
    <div style={{ ...s.row, ...(isLeft ? s.rowLeft : s.rowRight) }}>
      <div style={{ ...s.dot, opacity: dotFade }} />
      <div style={{ ...s.card, ...cardAnim }}>
        {item.heading && <div style={s.heading}>{item.heading}</div>}
        {item.text && <div style={s.text}>{item.text}</div>}
      </div>
    </div>
  );
};

const Template004 = React.memo(({ scene }) => {
  const elements = scene?.elements || {};
  const title = elements.title || '';
  const items = elements.items || [];
  const bgColor = elements.backgroundColor || backgroundColors.slate;
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const titleFade = useFadeInOut({ fadeIn: 0, fadeInDuration: 12 });

  return (
    <AbsoluteFill style={{ backgroundColor: bgColor }}>
      <div style={s.container}>
        {title && <h1 style={{ ...s.title, opacity: titleFade }}>{title}</h1>}
        <div style={s.flow}>
          <div style={s.line} />
          {items.map((item, index) => (
            <FlowItem key={index} item={item} index={index} frameOffset={10} />
          ))}
        </div>
      </div>
      {scene?.audio?.file && <Audio src={scene.audio.file} />}
    </AbsoluteFill>
  );
});

Template004.displayName = 'Template004';

export default Template004;
