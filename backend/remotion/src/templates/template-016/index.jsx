import React from 'react';
import { AbsoluteFill, Audio, Img } from 'remotion';
import { styles } from './styles';
import { useTemplate016Animations } from './animations';
import { backgroundColors } from '../../styles';
import { mergeStyle, positionStyle } from '../../theme';

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
  const overrides = elements.styleConfig || {};

  const anim = useTemplate016Animations({ frameOffset: 0 });

  return (
    <AbsoluteFill style={{ backgroundColor: bgColor }}>
      <div style={{ ...styles.container, ...anim.bgStyle }}>
        <div style={styles.grid}>
          {images.slice(0, 4).map((img, index) => {
            const imgSrc = typeof img === 'string' ? img : img.url || img.src;
            if (!imgSrc) return null;
            return (
              <div key={index} style={{ ...anim.getImageAnim(index), borderRadius: 12, overflow: 'hidden' }}>
                <Img src={imgSrc} style={styles.gridImage} />
              </div>
            );
          })}
        </div>
        <div style={{ ...styles.overlay, ...anim.overlayStyle }}>
          {caption && <div style={mergeStyle({ ...styles.caption, ...anim.captionStyle, ...positionStyle(overrides.title?.position) }, overrides.title)}>{caption}</div>}
          {subtitle && <div style={mergeStyle({ ...styles.subtitle, ...positionStyle(overrides.subtitle?.position) }, overrides.subtitle)}>{subtitle}</div>}
        </div>
      </div>
      {scene?.audio?.file && <Audio src={scene.audio.file} />}
    </AbsoluteFill>
  );
});

Template016.displayName = 'Template016';
export default Template016;
