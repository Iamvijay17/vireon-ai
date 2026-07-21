import React, { useMemo } from 'react';
import { AbsoluteFill, Audio, Img, staticFile } from 'remotion';
import { styles } from './styles';
import { useTemplate001Animations } from './animations';
import { backgroundColors } from '../../styles';

/**
 * Template 001 - Educational Card
 * Layout: Background fade -> Heading slides from top -> Subtitle fades -> Image zooms
 *
 * JSON data format:
 * {
 *   templateId: "template-001",
 *   elements: {
 *     title: "string",
 *     subtitle: "string",
 *     image: "url or path",
 *     backgroundColor: "#hex" (optional)
 *   },
 *   audio: { file: "path" },
 *   duration: number
 * }
 */
const Template001 = React.memo(({ scene }) => {
  const elements = scene?.elements || {};
  const title = elements.title || '';
  const subtitle = elements.subtitle || '';
  const image = elements.image || '';
  const bgColor = elements.backgroundColor || backgroundColors.dark;

  const anim = useTemplate001Animations({ frameOffset: 0 });

  const backgroundGradient = useMemo(() => ({
    ...styles.backgroundLayer,
    background: `linear-gradient(135deg, ${bgColor} 0%, #16213e 50%, #0f3460 100%)`,
  }), [bgColor]);

  return (
    <AbsoluteFill style={{ backgroundColor: bgColor }}>
      {/* Background Layer */}
      <div style={backgroundGradient} />

      {/* Content Layer */}
      <div style={styles.container}>
        <div style={styles.contentLayer}>
          {/* Image */}
          {image && (
            <div style={{ ...styles.imageWrapper, ...anim.imageStyle }}>
              <Img src={image} style={styles.image} />
            </div>
          )}

          {/* Title */}
          {title && (
            <h1 style={{ ...styles.title, ...anim.headingStyle }}>
              {title}
            </h1>
          )}

          {/* Subtitle */}
          {subtitle && (
            <p style={{ ...styles.subtitle, ...anim.subtitleStyle }}>
              {subtitle}
            </p>
          )}
        </div>
      </div>

      {/* Audio */}
      {scene?.audio?.file && (
        <Audio src={scene.audio.file} />
      )}
    </AbsoluteFill>
  );
});

Template001.displayName = 'Template001';

export default Template001;
