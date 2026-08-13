import React from 'react';
import { AbsoluteFill, Audio, Img } from 'remotion';
import { styles } from './styles';
import { useTemplate025Animations } from './animations';
import { backgroundColors } from '../../styles';
import { mergeStyle, positionStyle } from '../../theme';

/**
 * Template 025 - Curtain Reveal Story
 * Layout: Image behind a sliding curtain overlay, text bottom panel
 */
const Template025 = React.memo(({ scene }) => {
  const elements = scene?.elements || {};
  const title = elements.title || '';
  const body = elements.body || elements.text || '';
  const image = elements.image || '';
  const tag = elements.tag || elements.label || '';
  const bgColor = elements.backgroundColor || backgroundColors.dark;
  const overrides = elements.styleConfig || {};

  const anim = useTemplate025Animations({ frameOffset: 0 });

  return (
    <AbsoluteFill style={{ backgroundColor: bgColor }}>
      <div style={{ ...styles.container, ...anim.bgStyle }}>
        {image && <Img src={image} style={{ ...styles.imageFull, ...anim.imageStyle }} />}
        <div style={{ ...styles.revealOverlay, ...anim.revealStyle }} />
        <div style={styles.textContainer}>
          {tag && <div style={{ ...styles.tag, ...anim.tagStyle }}>{tag}</div>}
          {title && (
            <h1 style={mergeStyle({ ...styles.title, ...anim.titleStyle, ...positionStyle(overrides.title?.position) }, overrides.title)}>
              {title}
            </h1>
          )}
          {body && <p style={{ ...styles.body, ...anim.bodyStyle }}>{body}</p>}
        </div>
      </div>
      {scene?.audio?.file && <Audio src={scene.audio.file} />}
    </AbsoluteFill>
  );
});

Template025.displayName = 'Template025';
export default Template025;
