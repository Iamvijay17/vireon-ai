import React from 'react';
import { AbsoluteFill, Audio, Img, useVideoConfig } from 'remotion';
import { styles } from './styles';
import { useSplitRevealAnimations } from './animations';
import { backgroundColors } from '../../styles';
import { mergeStyle, positionStyle, getOrientation } from '../../theme';

/**
 * 004-contentwithimage template ("Split Reveal" variant of the
 * "contentwithimage" scene type)
 *
 * A full-bleed image with a diagonal-edged text panel that slides in from
 * the left over it (via clip-path), instead of 001-contentwithimage's
 * plain straight-edge side-by-side split, 002's badge-on-image card, or
 * 003's full-bleed cinematic scrim - a more dynamic, angled reveal
 * composition. Same elements shape as "001-contentwithimage".
 *
 * Data format: same as "001-contentwithimage" -
 * { title, body, image, badge, backgroundColor?, styleConfig }.
 */
const ContentWithImage004 = React.memo(({ scene }) => {
  const { width, height } = useVideoConfig();
  // The diagonal-edged panel is a fixed 52%-wide, full-height overlay tuned
  // for a wide canvas - on portrait/square that leaves too little text
  // width and an awkward clip angle. Switch it to a full-width, bottom-half
  // panel (image stays visible in the top half) instead of just widening
  // the same full-height overlay, which would hide the image completely.
  const isLandscape = getOrientation(width, height) === 'landscape';
  const elements = scene?.elements || {};
  const title = elements.title || '';
  const body = elements.body || elements.text || '';
  const image = elements.image || '';
  const badge = elements.badge || elements.label || '';
  const bgColor = elements.backgroundColor || backgroundColors.navy;
  const overrides = elements.styleConfig || {};

  const anim = useSplitRevealAnimations({ frameOffset: 0 });
  const titleStyle = mergeStyle({ ...styles.title, ...positionStyle(overrides.title?.position) }, overrides.title);
  const bodyStyle = mergeStyle(styles.body, overrides.body);

  return (
    <AbsoluteFill style={{ backgroundColor: bgColor }}>
      <div style={styles.container}>
        {image && <Img src={image} style={{ ...styles.image, ...anim.imageStyle }} />}
        <div style={styles.dim} />

        <div
          style={
            isLandscape
              ? { ...styles.panel, backgroundColor: bgColor, ...anim.panelStyle }
              : {
                  ...styles.panel,
                  backgroundColor: bgColor,
                  top: 'auto',
                  bottom: 0,
                  width: '100%',
                  height: '55%',
                  clipPath: 'none',
                  padding: '30px 50px',
                  ...anim.panelStyle,
                }
          }
        >
          {badge && <div style={{ ...styles.badge, ...anim.badgeStyle }}>{badge}</div>}
          {title && <h1 data-style-role="title" style={{ ...titleStyle, ...anim.titleStyle }}>{title}</h1>}
          {body && <p style={{ ...bodyStyle, ...anim.bodyStyle }}>{body}</p>}
        </div>
      </div>
      {scene?.audio?.file && <Audio src={scene.audio.file} />}
    </AbsoluteFill>
  );
});

ContentWithImage004.displayName = 'ContentWithImage004';
export default ContentWithImage004;
