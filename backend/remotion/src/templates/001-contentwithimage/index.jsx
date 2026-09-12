import React from 'react';
import { AbsoluteFill, Audio, Img, useVideoConfig } from 'remotion';
import { styles } from './styles';
import { useContentWithImageAnimations } from './animations';
import { backgroundColors } from '../../styles';
import { mergeStyle, positionStyle, getOrientation } from '../../theme';

/**
 * ContentWithImage template (Image + Text split)
 * Layout: Left image with ken burns zoom, right text panel with badge/title/body.
 * Canonical template for the "contentwithimage" scene type - content
 * delivery paired with a supporting image, no stat/icon chrome.
 *
 * Data format:
 * {
 *   templateId: "001-contentwithimage",
 *   elements: {
 *     title: "string",
 *     body: "string",
 *     image: "url or path",
 *     badge: "string" (optional),
 *     backgroundColor: "#hex" (optional)
 *   },
 *   audio: { file: "path" },
 *   duration: number
 * }
 */
const ContentWithImage = React.memo(({ scene }) => {
  const { width, height } = useVideoConfig();
  // The image/text 50/50 row-split reads fine in landscape, but squeezes
  // both panels into narrow columns in portrait/square - stack the image
  // above the text there instead.
  const isLandscape = getOrientation(width, height) === 'landscape';
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
      <div style={isLandscape ? styles.container : { ...styles.container, flexDirection: 'column' }}>
        <div style={isLandscape ? styles.imagePanel : { ...styles.imagePanel, flex: 1 }}>
          <div style={{ ...styles.imageOverlay }} />
          {image && <Img src={image} style={{ ...styles.storyImage, ...anim.imageStyle }} />}
        </div>
        <div style={isLandscape ? { ...styles.textPanel, ...anim.bgStyle } : { ...styles.textPanel, ...anim.bgStyle, flex: 1, padding: '40px 50px' }}>
          {badge && <div style={{ ...styles.stepBadge, ...anim.badgeStyle }}>{badge}</div>}
          {title && <h1 data-style-role="title" style={{ ...titleStyle, ...anim.titleStyle }}>{title}</h1>}
          {body && <p style={{ ...bodyStyle, ...anim.bodyStyle }}>{body}</p>}
        </div>
      </div>
      {scene?.audio?.file && <Audio src={scene.audio.file} />}
    </AbsoluteFill>
  );
});

ContentWithImage.displayName = 'ContentWithImage';
export default ContentWithImage;
