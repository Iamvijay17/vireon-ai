import React from 'react';
import { AbsoluteFill, Audio, useCurrentFrame, useVideoConfig } from 'remotion';
import { styles } from './styles';
import { useTemplate027Animations, getChecklistItemAnimation } from './animations';
import { backgroundColors } from '../../styles';

/**
 * Template 027 - Checklist / Key Points
 * Layout: Checkmark bullet list explaining key points
 */
const Template027 = React.memo(({ scene }) => {
  const elements = scene?.elements || {};
  const title = elements.title || '';
  const points = elements.points || [];
  const bgColor = elements.backgroundColor || backgroundColors.dark;

  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  
  const anim = useTemplate027Animations({ frameOffset: 0 });

  return (
    <AbsoluteFill style={{ backgroundColor: bgColor }}>
      <div style={{ ...styles.container, ...anim.bgStyle }}>
        {title && <h1 style={{ ...styles.title, ...anim.titleStyle }}>{title}</h1>}
        <div style={styles.list}>
          {points.map((point, index) => (
            <div key={index} style={{ ...styles.item, ...getChecklistItemAnimation(frame, fps, 12 + index * 6) }}>
              <div style={styles.check}>{point.icon || '\u2713'}</div>
              <div style={styles.itemText}>{point.text || ''}</div>
            </div>
          ))}
        </div>
      </div>
      {scene?.audio?.file && <Audio src={scene.audio.file} />}
    </AbsoluteFill>
  );
});

Template027.displayName = 'Template027';
export default Template027;
