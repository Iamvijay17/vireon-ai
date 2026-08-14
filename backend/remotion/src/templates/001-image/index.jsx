import React, { useMemo } from 'react';
import { AbsoluteFill, Audio, Img } from 'remotion';
import { styles } from './styles';
import { useImageAnimations } from './animations';
import { backgroundColors } from '../../styles';
import { mergeStyle, positionStyle } from '../../theme';

/**
 * Image template - Image Focus
 * Layout: Large image zoom with blur reveal, bottom caption fade in
 *
 * JSON data format:
 * {
 *   templateId: "001-image",
 *   elements: {
 *     image: "url or path",
 *     caption: "string",
 *     label: "string" (optional, e.g. "Featured"),
 *     overlayColor: "string" (optional, CSS gradient)
 *   },
 *   audio: { file: "path" },
 *   duration: number
 * }
 */
const ImageTemplate = React.memo(({ scene }) => {
  const elements = scene?.elements || {};
  const image = elements.image || '';
  const caption = elements.caption || '';
  const label = elements.label || '';
  const overlayGradient = elements.overlayColor || 'linear-gradient(transparent 40%, rgba(0, 0, 0, 0.85) 100%)';
  const bgColor = elements.backgroundColor || backgroundColors.clean;
  const overrides = elements.styleConfig || {};

  const anim = useImageAnimations({ frameOffset: 0 });

  const overlayStyle = useMemo(() => ({
    ...styles.overlay,
    background: overlayGradient,
  }), [overlayGradient]);

  return (
    <AbsoluteFill style={{ backgroundColor: bgColor }}>
      <div style={styles.container}>
        {/* Image Layer */}
        <div style={{ ...styles.imageLayer, ...anim.imageStyle }}>
          {image && (
            <Img src={image} style={styles.image} />
          )}
          {!image && (
            <div style={{ ...styles.image, backgroundColor: 'rgba(255,255,255,0.05)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <span style={{ color: 'rgba(255,255,255,0.3)', fontSize: 18 }}>No Image</span>
            </div>
          )}
        </div>

        {/* Gradient Overlay */}
        <div style={overlayStyle} />

        {/* Caption Container */}
        <div style={styles.captionContainer}>
          {label && (
            <p data-style-role="subtitle" style={mergeStyle({ ...styles.label, ...anim.labelStyle, ...positionStyle(overrides.subtitle?.position) }, overrides.subtitle)}>
              {label}
            </p>
          )}
          {caption && (
            <h2 data-style-role="title" style={mergeStyle({ ...styles.caption, ...anim.captionStyle, ...positionStyle(overrides.title?.position) }, overrides.title)}>
              {caption}
            </h2>
          )}
        </div>
      </div>

      {scene?.audio?.file && (
        <Audio src={scene.audio.file} />
      )}
    </AbsoluteFill>
  );
});

ImageTemplate.displayName = 'ImageTemplate';

export default ImageTemplate;
