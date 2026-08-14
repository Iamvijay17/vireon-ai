import React from 'react';
import { AbsoluteFill, Audio, Img } from 'remotion';
import { styles } from './styles';
import { useContentWithImageAnimations } from './animations';
import { backgroundColors } from '../../styles';
import { mergeStyle, positionStyle } from '../../theme';

/**
 * 003-contentwithimage template ("Cinematic" variant of the
 * "contentwithimage" scene type)
 *
 * The image fills the entire frame (not a side panel like 001, not a
 * badge-overlay card like 002) with a bottom gradient scrim and the
 * badge/title/body text anchored at the bottom over it - a full-bleed,
 * cinematic composition distinct from both existing variants. Same
 * elements shape as "001-contentwithimage".
 *
 * Data format: same as "001-contentwithimage" -
 * { title, body, image, badge, backgroundColor?, styleConfig }.
 */
const ContentWithImage003 = React.memo(({ scene }) => {
  const elements = scene?.elements || {};
  const title = elements.title || '';
  const body = elements.body || elements.text || '';
  const image = elements.image || '';
  const badge = elements.badge || elements.label || '';
  const bgColor = elements.backgroundColor || backgroundColors.dark;
  const overrides = elements.styleConfig || {};

  const anim = useContentWithImageAnimations({ frameOffset: 0 });
  const titleStyle = mergeStyle({ ...styles.title, ...positionStyle(overrides.title?.position) }, overrides.title);
  const bodyStyle = mergeStyle(styles.body, overrides.body);

  return (
    <AbsoluteFill style={{ backgroundColor: bgColor }}>
      <div style={styles.container}>
        {image && <Img src={image} style={{ ...styles.image, ...anim.imageStyle }} />}
        <div style={{ ...styles.scrim, ...anim.bgStyle }} />

        <div style={styles.textPanel}>
          {badge && <p style={{ ...styles.badge, ...anim.badgeStyle }}>{badge}</p>}
          {title && <h1 data-style-role="title" style={{ ...titleStyle, ...anim.titleStyle }}>{title}</h1>}
          {body && <p style={{ ...bodyStyle, ...anim.bodyStyle }}>{body}</p>}
        </div>
      </div>
      {scene?.audio?.file && <Audio src={scene.audio.file} />}
    </AbsoluteFill>
  );
});

ContentWithImage003.displayName = 'ContentWithImage003';
export default ContentWithImage003;
