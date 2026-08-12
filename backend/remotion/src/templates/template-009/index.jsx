import React from 'react';
import { AbsoluteFill, Audio, useCurrentFrame } from 'remotion';
import { styles } from './styles';
import { useTemplate009Animations, getBulletItemAnimation } from './animations';
import { backgroundColors } from '../../styles';
import { mergeStyle } from '../../theme';

/**
 * Template 009 - Bullet List
 * Layout: Plain bullet-dot rows sliding in from the left - no card chrome,
 * no icon badges.
 *
 * JSON data format:
 * {
 *   templateId: "template-009",
 *   elements: {
 *     title: "string",
 *     items: [{ heading: "string", text: "string" }],
 *     backgroundColor: "#hex" (optional),
 *     styleConfig: { title: {...}, body: {...}, accentColor: "#hex" }
 *   }
 * }
 */
const Template009 = React.memo(({ scene }) => {
  const elements = scene?.elements || {};
  const title = elements.title || '';
  const bgColor = elements.backgroundColor || backgroundColors.navy;
  // Back-compat: older generated scenes may still carry {text, icon} items
  // (icon is simply dropped - see the icon-badge chrome removal above).
  const items = elements.items || [];
  const overrides = elements.styleConfig || {};

  const frame = useCurrentFrame();
  const anim = useTemplate009Animations({ frameOffset: 0 });
  const titleStyle = mergeStyle(styles.title, overrides.title);
  const textStyle = mergeStyle(styles.text, overrides.body);
  const bulletStyle = overrides.accentColor ? { backgroundColor: overrides.accentColor } : {};

  return (
    <AbsoluteFill style={{ backgroundColor: bgColor }}>
      <div style={{ ...styles.container, ...anim.bgStyle }}>
        {title && <h1 style={{ ...titleStyle, ...anim.titleStyle }}>{title}</h1>}
        <div style={styles.list}>
          {items.map((item, index) => (
            <div key={index} style={{ ...styles.row, ...getBulletItemAnimation(frame, 15 + index * 6) }}>
              <div style={{ ...styles.bulletDot, ...bulletStyle }} />
              <div>
                {item.heading && <div style={styles.heading}>{item.heading}</div>}
                {(item.text || item.title) && <div style={textStyle}>{item.text || item.title}</div>}
              </div>
            </div>
          ))}
        </div>
      </div>
      {scene?.audio?.file && <Audio src={scene.audio.file} />}
    </AbsoluteFill>
  );
});

Template009.displayName = 'Template009';
export default Template009;
