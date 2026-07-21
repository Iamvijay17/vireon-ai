import React from 'react';
import { AbsoluteFill, Audio, useCurrentFrame } from 'remotion';
import { styles } from './styles';
import { useTemplate009Animations, getBulletItemAnimation } from './animations';
import { backgroundColors } from '../../styles';

/**
 * Template 009 - Bullet List
 * Layout: Animated bullet-point list sliding in from left
 */
const Template009 = React.memo(({ scene }) => {
  const elements = scene?.elements || {};
  const title = elements.title || '';
  const bgColor = elements.backgroundColor || backgroundColors.navy;
  const items = elements.items || [];

  const frame = useCurrentFrame();
  
  const anim = useTemplate009Animations({ frameOffset: 0 });

  return (
    <AbsoluteFill style={{ backgroundColor: bgColor }}>
      <div style={{ ...styles.container, ...anim.bgStyle }}>
        {title && <h1 style={{ ...styles.title, ...anim.titleStyle }}>{title}</h1>}
        <div style={styles.list}>
          {items.map((item, index) => (
            <div key={index} style={{ ...styles.listItem, ...getBulletItemAnimation(frame, 15 + index * 6) }}>
              <div style={styles.bulletIcon}>{item.icon || '✅'}</div>
              <div style={styles.bulletText}>{item.text || ''}</div>
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
