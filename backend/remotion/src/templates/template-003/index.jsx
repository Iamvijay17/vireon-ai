import React, { useMemo } from 'react';
import { AbsoluteFill, Audio, Img } from 'remotion';
import { styles } from './styles';
import { useTemplate003Animations } from './animations';
import { backgroundColors } from '../../styles';

/**
 * Template 003 - Image Focus
 * Layout: Large image zoom with blur reveal, bottom caption fade in
 *
 * JSON data format:
 * {
 *   templateId: "template-003",
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
const Template003 = React.memo(({ scene }) => {
  const elements = scene?.elements || {};
  const image = elements.image || '';
  const caption = elements.caption || '';
  const label = elements.label || '';
  const overlayGradient = elements.overlayColor || 'linear-gradient(transparent 40%, rgba(0, 0, 0, 0.85) 100%)';
  const bgColor = elements.backgroundColor || backgroundColors.clean;

  const anim = useTemplate003Animations({ frameOffset: 0 });

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
        </div>

        {/* Gradient Overlay */}
        <div style={overlayStyle} />

        {/* Caption Container */}
        <div style={styles.captionContainer}>
          {label && (
            <p style={{ ...styles.label, ...anim.labelStyle }}>
              {label}
            </p>
          )}
          {caption && (
            <h2 style={{ ...styles.caption, ...anim.captionStyle }}>
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

Template003.displayName = 'Template003';

export default Template003;
