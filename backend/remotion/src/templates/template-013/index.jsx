import React from 'react';
import { AbsoluteFill, Audio } from 'remotion';
import { styles } from './styles';
import { useTemplate013Animations } from './animations';
import { backgroundColors } from '../../styles';
import { mergeStyle, positionStyle } from '../../theme';

/**
 * Template 013 - Steps / How-To
 * Layout: Numbered steps list with heading + text.
 *
 * JSON data format:
 * {
 *   templateId: "template-013",
 *   elements: { title, items: [{ heading, text }], backgroundColor?, styleConfig? }
 * }
 */
const Template013 = React.memo(({ scene }) => {
  const elements = scene?.elements || {};
  const title = elements.title || '';
  const emoji = elements.emoji || '📋';
  // Back-compat: older scenes may still carry the old `steps:[{title,description}]` shape.
  const items = elements.items || elements.steps || [];
  const bgColor = elements.backgroundColor || backgroundColors.slate;
  const overrides = elements.styleConfig || {};
  const titleStyle = mergeStyle({ ...styles.title, ...positionStyle(overrides.title?.position) }, overrides.title);

  const anim = useTemplate013Animations({ frameOffset: 0 });

  return (
    <AbsoluteFill style={{ backgroundColor: bgColor }}>
      <div style={{ ...styles.container, ...anim.bgStyle }}>
        {title && (
          <div style={{ ...styles.header, ...anim.headerStyle }}>
            {emoji && <span style={styles.emoji}>{emoji}</span>}
            <h1 style={titleStyle}>{title}</h1>
          </div>
        )}
        <div style={styles.stepsContainer}>
          {items.map((item, index) => (
            <div key={index} style={{ ...styles.stepRow, ...anim.getStepAnim(index) }}>
              <div style={styles.stepNumber}>{index + 1}</div>
              <div style={styles.stepContent}>
                <div style={styles.stepTitle}>{item.heading || item.title}</div>
                {(item.text || item.description) && <div style={styles.stepDesc}>{item.text || item.description}</div>}
              </div>
            </div>
          ))}
        </div>
      </div>
      {scene?.audio?.file && <Audio src={scene.audio.file} />}
    </AbsoluteFill>
  );
});

Template013.displayName = 'Template013';
export default Template013;
