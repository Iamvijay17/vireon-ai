import React from 'react';
import { AbsoluteFill, Audio, Img } from 'remotion';
import { styles } from './styles';
import { useTemplate018Animations } from './animations';
import { backgroundColors } from '../../styles';

/**
 * Template 018 - Masonry Image Wall
 * Layout: Pinterest-style masonry columns with staggered image reveals
 */
const Template018 = React.memo(({ scene }) => {
  const elements = scene?.elements || {};
  const images = elements.images || elements.items || [];
  const caption = elements.caption || '';
  const bgColor = elements.backgroundColor || backgroundColors.dark;

  const anim = useTemplate018Animations({ frameOffset: 0 });

  const col1 = images.filter((_, i) => i % 3 === 0);
  const col2 = images.filter((_, i) => i % 3 === 1);
  const col3 = images.filter((_, i) => i % 3 === 2);

  return (
    <AbsoluteFill style={{ backgroundColor: bgColor }}>
      <div style={{ ...styles.container, ...anim.bgStyle }}>
        <div style={styles.masonry}>
          {[col1, col2, col3].map((col, ci) => (
            <div key={ci} style={styles.column}>
              {col.map((img, ii) => {
                const globalIdx = ci * 3 + ii;
                return (
                  <Img
                    key={ii}
                    src={typeof img === 'string' ? img : img.url || img.src}
                    style={{
                      ...styles.masonryImage,
                      height: img.height || `${180 + (globalIdx % 3) * 60}px`,
                      ...anim.getImageAnim(globalIdx),
                    }}
                  />
                );
              })}
            </div>
          ))}
        </div>
        {caption && (
          <div style={{ ...styles.overlay, ...anim.overlayStyle }}>
            <div style={styles.caption}>{caption}</div>
          </div>
        )}
      </div>
      {scene?.audio?.file && <Audio src={scene.audio.file} />}
    </AbsoluteFill>
  );
});

Template018.displayName = 'Template018';
export default Template018;
