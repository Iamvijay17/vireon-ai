import React from 'react';
import { AbsoluteFill, Audio } from 'remotion';
import { backgroundColors } from '../../styles';
import { spacing, mergeStyle, positionStyle } from '../../theme';
import { useFadeInOut, useSlideUp } from '../../animations';

/**
 * Template 015 - Feature Grid (Content)
 * Layout: Plain two-column list of feature rows (title + description) with a
 * hairline divider - no icon badges, no card chrome.
 *
 * JSON data format:
 * {
 *   templateId: "template-015",
 *   elements: {
 *     title: "string",
 *     items: [{ heading: "string", text: "string" }],
 *     backgroundColor: "#hex" (optional),
 *     styleConfig: { title: {...}, body: {...} }
 *   },
 *   audio: { file: "path" },
 *   duration: number
 * }
 */
const s = {
  container: { width: '100%', height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: `${spacing.xxl}px ${spacing.xxxl}px`, boxSizing: 'border-box', position: 'relative', overflow: 'hidden' },
  title: { color: '#ffffff', fontSize: 56, fontWeight: 300, textAlign: 'center', marginBottom: spacing.xl },
  grid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: `${spacing.lg}px ${spacing.xxl}px` },
  row: { borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: spacing.sm },
  cardTitle: { color: '#ffffff', fontSize: 22, fontWeight: 600, marginBottom: spacing.xs },
  cardDesc: { color: '#94a3b8', fontSize: 17, lineHeight: 1.4 },
};

const GridItem = ({ item, index, textStyle }) => {
  const slide = useSlideUp({ startAt: 14 + index * 6, distance: 24 });
  // Back-compat: older scenes may still carry {title, description}.
  const heading = item.heading || item.title || '';
  const text = item.text || item.description || '';
  return (
    <div style={{ ...s.row, ...slide }}>
      {heading && <div style={s.cardTitle}>{heading}</div>}
      {text && <div style={{ ...s.cardDesc, ...textStyle }}>{text}</div>}
    </div>
  );
};

const Template015 = React.memo(({ scene }) => {
  const elements = scene?.elements || {};
  const title = elements.title || '';
  const items = elements.items || elements.features || [];
  const bgColor = elements.backgroundColor || backgroundColors.dark;
  const overrides = elements.styleConfig || {};
  const titleFade = useFadeInOut({ fadeIn: 0, fadeInDuration: 12 });
  const titleStyle = mergeStyle({ ...s.title, ...positionStyle(overrides.title?.position) }, overrides.title);

  return (
    <AbsoluteFill style={{ backgroundColor: bgColor }}>
      <div style={s.container}>
        {title && <h1 data-style-role="title" style={{ ...titleStyle, opacity: titleFade }}>{title}</h1>}
        <div style={s.grid}>
          {items.map((item, index) => (
            <GridItem key={index} item={item} index={index} textStyle={overrides.body} />
          ))}
        </div>
      </div>
      {scene?.audio?.file && <Audio src={scene.audio.file} />}
    </AbsoluteFill>
  );
});

Template015.displayName = 'Template015';
export default Template015;
