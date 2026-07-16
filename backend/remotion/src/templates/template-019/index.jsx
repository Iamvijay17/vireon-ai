import React from 'react';
import { AbsoluteFill, Audio, Img } from 'remotion';
import { styles } from './styles';
import { useTemplate019Animations } from './animations';
import { backgroundColors } from '../../styles';

/**
 * Template 019 - Parallax Story Hero
 * Layout: Full-bleed image with slow parallax zoom, overlaid title/subtitle/CTA
 */
const Template019 = React.memo(({ scene }) => {
  const elements = scene?.elements || {};
  const title = elements.title || '';
  const subtitle = elements.subtitle || '';
  const image = elements.image || '';
  const cta = elements.cta || '';
  const bgColor = elements.backgroundColor || backgroundColors.dark;

  const anim = useTemplate019Animations({ frameOffset: 0 });

  return (
    <AbsoluteFill style={{ backgroundColor: bgColor }}>
      <div style={styles.container}>
        <div style={{ ...styles.parallaxLayer, ...anim.parallaxStyle }}>
          {image && <Img src={image} style={styles.parallaxImage} />}
        </div>
        <div style={styles.overlay} />
        <div style={{ ...styles.content, ...anim.bgStyle }}>
          {title && <h1 style={{ ...styles.title, ...anim.titleStyle }}>{title}</h1>}
          {subtitle && <p style={{ ...styles.subtitle, ...anim.subtitleStyle }}>{subtitle}</p>}
          {cta && <div style={{ ...styles.cta, ...anim.ctaStyle }}>{cta}</div>}
        </div>
      </div>
      {scene?.audio?.file && <Audio src={scene.audio.file} />}
    </AbsoluteFill>
  );
});

Template019.displayName = 'Template019';
export default Template019;
