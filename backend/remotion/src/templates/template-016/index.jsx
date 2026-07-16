import React from 'react';
import { AbsoluteFill, Audio, Img } from 'remotion';
import { styles } from './styles';
import { useTemplate016Animations } from './animations';
import { backgroundColors } from '../../styles';

/**
 * Template 016 - Image Collage Grid (2x2)
 * Layout: Four images in a grid, staggered zoom-in, caption overlay at bottom
 */
const Template016 = React.memo(({ scene }) => {
  const elements = scene?.elements || {};
  const images = elements.images || elements.items || [];
  const caption = elements.caption || '';
  const subtitle = elements.subtitle || '';
  const bgColor = elements.backgroundColor || backgroundColors.dark;

  const anim = useTemplate016Animations({ frameOffset: 0 });

  return (
    <AbsoluteFill style={{ backgroundColor: bgColor }}>
      <div style={{ ...styles.container, ...anim.bgStyle }}>
        <div style={styles.grid}>
          {images.slice(0, 4).map((img, index) => (
            <div key={index} style={{ ...anim.getImageAnim(index), borderRadius: 12, overflow: 'hidden' }}>
              <Img src={typeof img === 'string' ? img : img.url || img.src} style={styles.gridImage} />
            </div>
          ))}
        </div>
        <div style={{ ...styles.overlay, ...anim.overlayStyle }}>
          {caption && <div style={{ ...styles.caption, ...anim.captionStyle }}>{caption}</div>}
          {subtitle && <div style={styles.subtitle}>{subtitle}</div>}
        </div>
      </div>
      {scene?.audio?.file && <Audio src={scene.audio.file} />}
    </AbsoluteFill>
  );
});

Template016.displayName = 'Template016';
export default Template016;
