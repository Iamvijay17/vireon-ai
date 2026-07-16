import React from 'react';
import { AbsoluteFill, Audio, Img } from 'remotion';
import { styles } from './styles';
import { useTemplate021Animations } from './animations';
import { backgroundColors } from '../../styles';

/**
 * Template 021 - Vignette Story
 * Layout: Full-bleed image with radial vignette, centered title/body with gold accent
 */
const Template021 = React.memo(({ scene }) => {
  const elements = scene?.elements || {};
  const title = elements.title || '';
  const body = elements.body || elements.text || '';
  const image = elements.image || '';
  const bgColor = elements.backgroundColor || backgroundColors.dark;

  const anim = useTemplate021Animations({ frameOffset: 0 });

  return (
    <AbsoluteFill style={{ backgroundColor: bgColor }}>
      <div style={{ ...styles.container, ...anim.bgStyle }}>
        {image && <Img src={image} style={{ ...styles.bgImage, ...anim.imageStyle }} />}
        <div style={styles.vignette} />
        <div style={styles.content}>
          <div style={{ ...styles.accentLine, ...anim.lineStyle }} />
          {title && <h1 style={{ ...styles.title, ...anim.titleStyle }}>{title}</h1>}
          {body && <p style={{ ...styles.body, ...anim.bodyStyle }}>{body}</p>}
        </div>
      </div>
      {scene?.audio?.file && <Audio src={scene.audio.file} />}
    </AbsoluteFill>
  );
});

Template021.displayName = 'Template021';
export default Template021;
