import React from 'react';
import { AbsoluteFill, Audio, Img } from 'remotion';
import { styles } from './styles';
import { useTemplate022Animations } from './animations';
import { backgroundColors } from '../../styles';

/**
 * Template 022 - Polaroid Collage
 * Layout: Overlapping polaroid photos with staggered fade-in
 */
const Template022 = React.memo(({ scene }) => {
  const elements = scene?.elements || {};
  const title = elements.title || '';
  const photos = elements.photos || elements.items || [];
  const bgColor = elements.backgroundColor || backgroundColors.navy;

  const anim = useTemplate022Animations({ frameOffset: 0 });

  return (
    <AbsoluteFill style={{ backgroundColor: bgColor }}>
      <div style={{ ...styles.container, ...anim.bgStyle }}>
        {title && <h1 style={{ ...styles.title, ...anim.titleStyle }}>{title}</h1>}
        {photos[0] && (
          <div style={{ ...styles.polaroid, ...anim.polaroidStyle0 }}>
            <Img src={photos[0].url || photos[0].src || photos[0]} style={styles.polaroidImage} />
            {photos[0].caption && <div style={styles.polaroidCaption}>{photos[0].caption}</div>}
          </div>
        )}
        {photos[1] && (
          <div style={{ ...styles.polaroid2, ...anim.polaroidStyle1 }}>
            <Img src={photos[1].url || photos[1].src || photos[1]} style={styles.polaroidImage} />
            {photos[1].caption && <div style={styles.polaroidCaption}>{photos[1].caption}</div>}
          </div>
        )}
      </div>
      {scene?.audio?.file && <Audio src={scene.audio.file} />}
    </AbsoluteFill>
  );
});

Template022.displayName = 'Template022';
export default Template022;
