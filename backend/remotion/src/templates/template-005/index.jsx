import React from 'react';
import { AbsoluteFill, Audio } from 'remotion';
import { backgroundColors } from '../../styles';
import { useFadeInOut, useSlideLeft, useSlideRight } from '../../animations';

/**
 * Template 005 - Comparison (Content)
 * Layout: Generic two-column content comparison, no VS badge framing.
 *
 * JSON data format:
 * {
 *   templateId: "template-005",
 *   elements: {
 *     title: "string",
 *     columns: [{ heading: "string", body: "string" }, { heading: "string", body: "string" }],
 *     backgroundColor: "#hex" (optional)
 *   },
 *   audio: { file: "path" },
 *   duration: number
 * }
 */
const s = {
  container: { width: '100%', height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: '60px 80px', boxSizing: 'border-box', position: 'relative', overflow: 'hidden' },
  title: { color: '#ffffff', fontSize: 44, fontWeight: 'bold', textAlign: 'center', marginBottom: 40 },
  columns: { display: 'flex', flexDirection: 'row', gap: 30, alignItems: 'stretch' },
  column: { flex: 1, backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: 18, padding: '32px 28px', border: '1px solid rgba(255,255,255,0.08)' },
  divider: { width: 2, backgroundColor: 'rgba(255,255,255,0.12)', alignSelf: 'stretch', margin: '10px 0' },
  heading: { color: '#60a5fa', fontSize: 26, fontWeight: 700, marginBottom: 14 },
  body: { color: '#cbd5e1', fontSize: 19, lineHeight: 1.5 },
};

const Template005 = React.memo(({ scene }) => {
  const e = scene?.elements || {};
  const title = e.title || '';
  const columns = e.columns && e.columns.length ? e.columns : [{ heading: '', body: '' }, { heading: '', body: '' }];
  const bgColor = e.backgroundColor || backgroundColors.slate;

  const titleFade = useFadeInOut({ fadeIn: 0, fadeInDuration: 12 });
  const leftAnim = useSlideLeft({ startAt: 14, distance: 70 });
  const rightAnim = useSlideRight({ startAt: 14, distance: 70 });
  const dividerFade = useFadeInOut({ fadeIn: 24, fadeInDuration: 15 });

  return (
    <AbsoluteFill style={{ backgroundColor: bgColor }}>
      <div style={s.container}>
        {title && <h1 style={{ ...s.title, opacity: titleFade }}>{title}</h1>}
        <div style={s.columns}>
          <div style={{ ...s.column, ...leftAnim }}>
            {columns[0]?.heading && <div style={s.heading}>{columns[0].heading}</div>}
            {columns[0]?.body && <div style={s.body}>{columns[0].body}</div>}
          </div>
          <div style={{ ...s.divider, opacity: dividerFade }} />
          <div style={{ ...s.column, ...rightAnim }}>
            {columns[1]?.heading && <div style={s.heading}>{columns[1].heading}</div>}
            {columns[1]?.body && <div style={s.body}>{columns[1].body}</div>}
          </div>
        </div>
      </div>
      {scene?.audio?.file && <Audio src={scene.audio.file} />}
    </AbsoluteFill>
  );
});

Template005.displayName = 'Template005';

export default Template005;
