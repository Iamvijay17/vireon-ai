import React from 'react';
import { AbsoluteFill, Audio, useCurrentFrame } from 'remotion';
import { styles } from './styles';
import { useTemplate015Animations, getFeatureItemAnimation } from './animations';
import { backgroundColors } from '../../styles';

/**
 * Template 015 - Feature Grid
 * Layout: Grid of feature cards with icons, titles, and descriptions
 */
const Template015 = React.memo(({ scene }) => {
  const elements = scene?.elements || {};
  const title = elements.title || '';
  const features = elements.features || elements.items || [];
  const bgColor = elements.backgroundColor || backgroundColors.dark;

  const frame = useCurrentFrame();
  const anim = useTemplate015Animations({ frameOffset: 0 });

  return (
    <AbsoluteFill style={{ backgroundColor: bgColor }}>
      <div style={{ ...styles.container, ...anim.bgStyle }}>
        {title && <h1 style={{ ...styles.title, ...anim.titleStyle }}>{title}</h1>}
        <div style={styles.grid}>
          {features.map((item, index) => (
            <div key={index} style={{ ...styles.gridItem, ...getFeatureItemAnimation(frame, index) }}>
              {item.icon && <div style={styles.itemIcon}>{item.icon}</div>}
              <div style={styles.itemTitle}>{item.title}</div>
              {item.description && <div style={styles.itemDesc}>{item.description}</div>}
            </div>
          ))}
        </div>
      </div>
      {scene?.audio?.file && <Audio src={scene.audio.file} />}
    </AbsoluteFill>
  );
});

Template015.displayName = 'Template015';
export default Template015;
