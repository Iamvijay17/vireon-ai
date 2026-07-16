import React from 'react';
import { AbsoluteFill, Audio, Img } from 'remotion';
import { styles } from './styles';
import { useTemplate017Animations } from './animations';
import { backgroundColors } from '../../styles';

/**
 * Template 017 - Storytelling (Image + Text split)
 * Layout: Left image with ken burns zoom, right text panel with badge/title/body
 */
const Template017 = React.memo(({ scene }) => {
  const elements = scene?.elements || {};
  const title = elements.title || '';
  const body = elements.body || elements.text || '';
  const image = elements.image || '';
  const badge = elements.badge || elements.label || '';
  const bgColor = elements.backgroundColor || backgroundColors.navy;

  const anim = useTemplate017Animations({ frameOffset: 0 });

  return (
    <AbsoluteFill style={{ backgroundColor: bgColor }}>
      <div style={styles.container}>
        <div style={styles.imagePanel}>
          <div style={{ ...styles.imageOverlay }} />
          {image && <Img src={image} style={{ ...styles.storyImage, ...anim.imageStyle }} />}
        </div>
        <div style={{ ...styles.textPanel, ...anim.bgStyle }}>
          {badge && <div style={{ ...styles.stepBadge, ...anim.badgeStyle }}>{badge}</div>}
          {title && <h1 style={{ ...styles.title, ...anim.titleStyle }}>{title}</h1>}
          {body && <p style={{ ...styles.body, ...anim.bodyStyle }}>{body}</p>}
        </div>
      </div>
      {scene?.audio?.file && <Audio src={scene.audio.file} />}
    </AbsoluteFill>
  );
});

Template017.displayName = 'Template017';
export default Template017;
