import React from 'react';
import { AbsoluteFill, Audio, Img } from 'remotion';
import { styles } from './styles';
import { useTemplate024Animations } from './animations';
import { backgroundColors } from '../../styles';

/**
 * Template 024 - Split Reveal Story
 * Layout: Top/bottom image split with center divider, text overlay
 */
const Template024 = React.memo(({ scene }) => {
  const elements = scene?.elements || {};
  const title = elements.title || '';
  const label = elements.label || '';
  const topImage = elements.topImage || elements.image || '';
  const bottomImage = elements.bottomImage || elements.image2 || '';
  const bgColor = elements.backgroundColor || backgroundColors.dark;

  const anim = useTemplate024Animations({ frameOffset: 0 });

  return (
    <AbsoluteFill style={{ backgroundColor: bgColor }}>
      <div style={{ ...styles.container, ...anim.bgStyle }}>
        <div style={{ ...styles.splitTop, ...anim.topStyle }}>
          {topImage && <Img src={topImage} style={styles.splitImage} />}
        </div>
        <div style={{ ...styles.dividerBar, ...anim.barStyle }} />
        <div style={{ ...styles.splitBottom, ...anim.bottomStyle }}>
          {bottomImage && <Img src={bottomImage} style={styles.splitImage} />}
        </div>
        <div style={styles.overlay}>
          {label && <div style={{ ...styles.label, ...anim.labelStyle }}>{label}</div>}
          {title && <h1 style={{ ...styles.title, ...anim.titleStyle }}>{title}</h1>}
        </div>
      </div>
      {scene?.audio?.file && <Audio src={scene.audio.file} />}
    </AbsoluteFill>
  );
});

Template024.displayName = 'Template024';
export default Template024;
