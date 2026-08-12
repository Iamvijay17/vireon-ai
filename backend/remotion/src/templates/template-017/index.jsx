import React from 'react';
import { AbsoluteFill, Audio, Img } from 'remotion';
import { styles } from './styles';
import { useTemplate017Animations } from './animations';
import { backgroundColors } from '../../styles';
import { mergeStyle } from '../../theme';

/**
 * Template 017 - Storytelling (Image + Text split)
 * Layout: Left image with ken burns zoom, right text panel with badge/title/body.
 * Canonical template for the "contentwithimage" scene type - content
 * delivery paired with a supporting image, no stat/icon chrome.
 */
const Template017 = React.memo(({ scene }) => {
  const elements = scene?.elements || {};
  const title = elements.title || '';
  const body = elements.body || elements.text || '';
  const image = elements.image || '';
  const badge = elements.badge || elements.label || '';
  const bgColor = elements.backgroundColor || backgroundColors.navy;
  const overrides = elements.styleConfig || {};

  const anim = useTemplate017Animations({ frameOffset: 0 });
  const titleStyle = mergeStyle(styles.title, overrides.title);
  const bodyStyle = mergeStyle(styles.body, overrides.body);

  return (
    <AbsoluteFill style={{ backgroundColor: bgColor }}>
      <div style={styles.container}>
        <div style={styles.imagePanel}>
          <div style={{ ...styles.imageOverlay }} />
          {image && <Img src={image} style={{ ...styles.storyImage, ...anim.imageStyle }} />}
        </div>
        <div style={{ ...styles.textPanel, ...anim.bgStyle }}>
          {badge && <div style={{ ...styles.stepBadge, ...anim.badgeStyle }}>{badge}</div>}
          {title && <h1 style={{ ...titleStyle, ...anim.titleStyle }}>{title}</h1>}
          {body && <p style={{ ...bodyStyle, ...anim.bodyStyle }}>{body}</p>}
        </div>
      </div>
      {scene?.audio?.file && <Audio src={scene.audio.file} />}
    </AbsoluteFill>
  );
});

Template017.displayName = 'Template017';
export default Template017;
