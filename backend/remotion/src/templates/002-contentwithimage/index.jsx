import React from 'react';
import { AbsoluteFill, Audio, Img } from 'remotion';
import { styles } from './styles';
import { useContentWithImageAnimations } from './animations';
import { backgroundColors } from '../../styles';
import { mergeStyle, positionStyle } from '../../theme';

/**
 * 002-contentwithimage template ("Image Card" variant of the
 * "contentwithimage" scene type)
 *
 * Full-bleed image with a floating badge/label overlaid directly on the
 * image (top-left) and a bottom gradient panel carrying the title/body -
 * instead of 001-contentwithimage's side-by-side split image/text panel.
 * Same elements shape as "001-contentwithimage".
 *
 * Data format: same as "001-contentwithimage" -
 * { title, body, image, badge, backgroundColor?, styleConfig }.
 */
const ContentWithImage002 = React.memo(({ scene }) => {
  const elements = scene?.elements || {};
  const title = elements.title || '';
  const body = elements.body || elements.text || '';
  const image = elements.image || '';
  const badge = elements.badge || elements.label || '';
  const bgColor = elements.backgroundColor || backgroundColors.navy;
  const overrides = elements.styleConfig || {};

  const anim = useContentWithImageAnimations({ frameOffset: 0 });
  const titleStyle = mergeStyle({ ...styles.title, ...positionStyle(overrides.title?.position) }, overrides.title);
  const bodyStyle = mergeStyle(styles.body, overrides.body);

  return (
    <AbsoluteFill style={{ backgroundColor: bgColor }}>
      <div style={styles.container}>
        {image && <Img src={image} style={{ ...styles.image, ...anim.imageStyle }} />}
        <div style={{ ...styles.overlay, ...anim.bgStyle }} />

        {badge && <div style={{ ...styles.badge, ...anim.badgeStyle }}>{badge}</div>}

        <div style={styles.textPanel}>
          {title && <h1 data-style-role="title" style={{ ...titleStyle, ...anim.titleStyle }}>{title}</h1>}
          {body && <p style={{ ...bodyStyle, ...anim.bodyStyle }}>{body}</p>}
        </div>
      </div>
      {scene?.audio?.file && <Audio src={scene.audio.file} />}
    </AbsoluteFill>
  );
});

ContentWithImage002.displayName = 'ContentWithImage002';
export default ContentWithImage002;
