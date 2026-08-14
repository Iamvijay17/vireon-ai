import React, { useMemo } from 'react';
import { AbsoluteFill, Audio, Img, interpolate, useCurrentFrame } from 'remotion';
import { backgroundColors } from '../../styles';
import { typography, spacing, mergeStyle, positionStyle } from '../../theme';

/**
 * 003-title template ("Modern Minimal" variant of the "title" scene type)
 *
 * Minimal centered composition: thin-weight typography (theme's default
 * title weight), a single thin accent line under the title, and a subtle
 * gradient/grain background - no hero image treatment like 001-title's
 * gradient hero or 002-title's parallax image. A distinct, quieter visual
 * identity for understated intros. Same elements shape as "001-title".
 *
 * Data format: same as "001-title" -
 * { title, subtitle, image (optional), backgroundColor, styleConfig }.
 */
const Title003 = React.memo(({ scene }) => {
  const frame = useCurrentFrame();
  const elements = scene?.elements || {};
  const title = elements.title || '';
  const subtitle = elements.subtitle || '';
  const image = elements.image || '';
  const bgColor = elements.backgroundColor || backgroundColors.clean;
  const overrides = elements.styleConfig || {};
  const accentColor = overrides.accentColor;

  const gradientShift = useMemo(() => ({
    background: `linear-gradient(135deg, ${bgColor} 0%, #1a1a3e 50%, #0d1117 100%)`,
  }), [bgColor]);

  const titleOpacity = interpolate(frame, [0, 20], [0, 1], { extrapolateRight: 'clamp' });
  const titleY = interpolate(frame, [0, 25], [30, 0], { extrapolateRight: 'clamp' });
  const lineScaleX = interpolate(frame, [15, 32], [0, 1], { extrapolateRight: 'clamp' });
  const subOpacity = interpolate(frame, [22, 42], [0, 1], { extrapolateRight: 'clamp' });
  const imageOpacity = interpolate(frame, [10, 32], [0, 1], { extrapolateRight: 'clamp' });
  const imageScale = interpolate(frame, [10, 50], [0.92, 1], { extrapolateRight: 'clamp' });

  const titleStyle = mergeStyle(
    { ...typography.title, marginBottom: spacing.md, ...positionStyle(overrides.title?.position) },
    overrides.title
  );
  const subtitleStyle = mergeStyle(
    { ...typography.subtitle, maxWidth: '70%', ...positionStyle(overrides.subtitle?.position) },
    overrides.subtitle
  );

  return (
    <AbsoluteFill style={{ backgroundColor: bgColor }}>
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, ...gradientShift }} />

      <div
        style={{
          position: 'relative',
          zIndex: 1,
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          alignItems: 'center',
          padding: `${spacing.xxl}px ${spacing.xxxl}px`,
          boxSizing: 'border-box',
        }}
      >
        {image && (
          <div
            style={{
              width: 220,
              height: 220,
              borderRadius: '50%',
              overflow: 'hidden',
              marginBottom: spacing.xl,
              opacity: imageOpacity,
              transform: `scale(${imageScale})`,
              boxShadow: '0 12px 40px rgba(0,0,0,0.35)',
            }}
          >
            <Img src={image} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          </div>
        )}

        {title && (
          <h1
            data-style-role="title"
            style={{
              ...titleStyle,
              opacity: overrides.title?.position ? 1 : titleOpacity,
              transform: overrides.title?.position ? titleStyle.transform : `translateY(${titleY}px)`,
            }}
          >
            {title}
          </h1>
        )}

        <div
          style={{
            width: 64,
            height: 2,
            borderRadius: 1,
            backgroundColor: accentColor || '#60a5fa',
            margin: `${spacing.md}px 0`,
            transform: `scaleX(${lineScaleX})`,
            transformOrigin: 'center center',
          }}
        />

        {subtitle && (
          <p
            data-style-role="subtitle"
            style={{
              ...subtitleStyle,
              opacity: overrides.subtitle?.position ? 1 : subOpacity,
            }}
          >
            {subtitle}
          </p>
        )}
      </div>

      {scene?.audio?.file && <Audio src={scene.audio.file} />}
    </AbsoluteFill>
  );
});

Title003.displayName = 'Title003';
export default Title003;
