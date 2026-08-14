import React, { useMemo } from 'react';
import { AbsoluteFill, Audio, Img, interpolate, useCurrentFrame } from 'remotion';
import { backgroundColors } from '../../styles';
import { typography, spacing, slideLayout, mergeStyle, positionStyle } from '../../theme';

/**
 * Title template
 * Layout: Background fade -> Heading slides up -> Subtitle fades in -> optional image zooms in.
 * Canonical template for the "title" scene type (opening/intro cards).
 *
 * Data format:
 * {
 *   templateId: "title",
 *   elements: {
 *     title: "string",
 *     subtitle: "string",
 *     image: "url or path" (optional),
 *     backgroundColor: "#hex" (optional),
 *     styleConfig: { title: {...}, subtitle: {...} }
 *   },
 *   audio: { file: "path" },
 *   duration: number
 * }
 */
const Title = React.memo(({ scene }) => {
  const frame = useCurrentFrame();
  const elements = scene?.elements || {};
  const title = elements.title || '';
  const subtitle = elements.subtitle || '';
  const image = elements.image || '';
  const bgColor = elements.backgroundColor || backgroundColors.dark;
  const overrides = elements.styleConfig || {};

  const backgroundGradient = useMemo(() => ({
    position: 'absolute',
    top: 0,
    left: 0,
    width: '100%',
    height: '100%',
    zIndex: 0,
    background: `linear-gradient(135deg, ${bgColor} 0%, #16213e 50%, #0f3460 100%)`,
  }), [bgColor]);

  const headingY = interpolate(frame, [5, 30], [80, 0], { extrapolateRight: 'clamp' });
  const headingOpacity = interpolate(frame, [5, 25], [0, 1], { extrapolateRight: 'clamp' });
  const subtitleOpacity = interpolate(frame, [15, 40], [0, 1], { extrapolateRight: 'clamp' });
  const imageScale = interpolate(frame, [10, 50], [0.8, 1], { extrapolateRight: 'clamp' });
  const imageOpacity = interpolate(frame, [10, 30], [0, 1], { extrapolateRight: 'clamp' });

  const titleStyle = mergeStyle(
    { ...typography.title, marginBottom: spacing.md, textShadow: '0 2px 10px rgba(0,0,0,0.3)', ...positionStyle(overrides.title?.position) },
    overrides.title
  );
  const subtitleStyle = mergeStyle(
    { ...typography.subtitle, maxWidth: '80%', ...positionStyle(overrides.subtitle?.position) },
    overrides.subtitle
  );

  return (
    <AbsoluteFill style={{ backgroundColor: bgColor }}>
      {/* Background Layer */}
      <div style={backgroundGradient} />

      {/* Content Layer */}
      <div style={slideLayout}>
        <div
          style={{
            position: 'relative',
            zIndex: 1,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            width: '100%',
            maxWidth: '80%',
          }}
        >
          {/* Optional image */}
          {image && (
            <div
              style={{
                width: 400,
                height: 300,
                borderRadius: 16,
                overflow: 'hidden',
                marginBottom: spacing.xl,
                boxShadow: '0 20px 60px rgba(0, 0, 0, 0.3)',
                transform: `scale(${imageScale})`,
                opacity: imageOpacity,
              }}
            >
              <Img src={image} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            </div>
          )}

          {/* Title */}
          {title && (
            <h1
              data-style-role="title"
              style={{
                ...titleStyle,
                opacity: overrides.title?.position ? 1 : headingOpacity,
                transform: overrides.title?.position ? titleStyle.transform : `translateY(${headingY}px)`,
              }}
            >
              {title}
            </h1>
          )}

          {/* Subtitle */}
          {subtitle && (
            <p
              data-style-role="subtitle"
              style={{
                ...subtitleStyle,
                opacity: overrides.subtitle?.position ? 1 : subtitleOpacity,
              }}
            >
              {subtitle}
            </p>
          )}
        </div>
      </div>

      {/* Audio */}
      {scene?.audio?.file && <Audio src={scene.audio.file} />}
    </AbsoluteFill>
  );
});

Title.displayName = 'Title';

export default Title;
