import React from 'react';
import { AbsoluteFill, Audio, Img } from 'remotion';
import { styles } from './styles';
import { useTemplate020Animations } from './animations';
import { backgroundColors } from '../../styles';

/**
 * Template 020 - Image Card Story
 * Layout: Large top image with ken burns, bottom text panel with label/title/body
 */
const Template020 = React.memo(({ scene }) => {
  const elements = scene?.elements || {};
  const title = elements.title || '';
  const body = elements.body || elements.text || '';
  const image = elements.image || '';
  const label = elements.label || '';
  const bgColor = elements.backgroundColor || backgroundColors.dark;

  const anim = useTemplate020Animations({ frameOffset: 0 });

  return (
    <AbsoluteFill style={{ backgroundColor: bgColor }}>
      <div style={{ ...styles.container, ...anim.bgStyle }}>
        {image && <Img src={image} style={{ ...styles.topImage, ...anim.imageStyle }} />}
        <div style={styles.bottomPanel}>
          {label && <div style={{ ...styles.label, ...anim.labelStyle }}>{label}</div>}
          <div style={{ ...styles.divider, ...anim.dividerStyle }} />
          {title && <h1 style={{ ...styles.title, ...anim.titleStyle }}>{title}</h1>}
          {body && <p style={{ ...styles.body, ...anim.bodyStyle }}>{body}</p>}
        </div>
      </div>
      {scene?.audio?.file && <Audio src={scene.audio.file} />}
    </AbsoluteFill>
  );
});

Template020.displayName = 'Template020';
export default Template020;
