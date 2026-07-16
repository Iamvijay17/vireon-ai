import React from 'react';
import { AbsoluteFill, Audio } from 'remotion';
import { styles } from './styles';
import { useTemplate009Animations } from './animations';
import { backgroundColors } from '../../styles';

/**
 * Template 009 - Bullet List
 * Layout: Animated bullet-point list sliding in from left
 */
const Template009 = React.memo(({ scene }) => {
  const elements = scene?.elements || {};
  const title = elements.title || '';
  const items = elements.items || elements.bullets || [];
  const bgColor = elements.backgroundColor || backgroundColors.navy;
  const icons = ['🌟', '✅', '💡', '📌', '🔑', '🎯', '⚡', '🔥'];

  const anim = useTemplate009Animations({ frameOffset: 0 });

  return (
    <AbsoluteFill style={{ backgroundColor: bgColor }}>
      <div style={{ ...styles.container, ...anim.bgStyle }}>
        {title && <h1 style={{ ...styles.title, ...anim.titleStyle }}>{title}</h1>}
        <div style={styles.list}>
          {items.map((item, index) => (
            <div key={index} style={{ ...styles.listItem, ...anim.getItemAnim(index) }}>
              <div style={styles.bulletIcon}>{item.icon || icons[index % icons.length]}</div>
              <div style={styles.bulletText}>{item.text || item}</div>
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
