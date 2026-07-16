import React from 'react';
import { AbsoluteFill, Audio } from 'remotion';
import { styles } from './styles';
import { useTemplate029Animations } from './animations';
import { backgroundColors } from '../../styles';

const Template029 = React.memo(({ scene }) => {
  const e = scene?.elements || {};
  const title = e.title || '';
  const subtitle = e.subtitle || '';
  const facts = e.facts || e.items || [];
  const bgColor = e.backgroundColor || backgroundColors.dark;
  const anim = useTemplate029Animations({ frameOffset: 0 });
  return (
    <AbsoluteFill style={{ backgroundColor: bgColor }}>
      <div style={{ ...styles.container, ...anim.bgStyle }}>
        {title && <h1 style={{ ...styles.title, ...anim.titleStyle }}>{title}</h1>}
        {subtitle && <div style={{ ...styles.subtitle, ...anim.subStyle }}>{subtitle}</div>}
        {facts.map((f, i) => (
          <div key={i} style={{ ...styles.factRow, ...anim.getFactAnim(i) }}>
            <div style={styles.factIcon}>{f.icon || '\uD83D\uDCA1'}</div>
            <div style={styles.factContent}>
              <div style={styles.factTitle}>{f.title}</div>
              <div style={styles.factDesc}>{f.description || f.text}</div>
            </div>
          </div>
        ))}
      </div>
      {scene?.audio?.file && <Audio src={scene.audio.file} />}
    </AbsoluteFill>
  );
});
Template029.displayName = 'Template029';
export default Template029;
