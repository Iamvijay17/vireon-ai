import React, { useMemo } from 'react';
import { AbsoluteFill, Audio, Img, interpolate, useCurrentFrame, useVideoConfig } from 'remotion';
import { CaptionRenderer } from '../../captions/CaptionRenderer';
import { backgroundColors } from '../../styles';

/**
 * Template 041 - Modern Minimal
 *
 * A clean, minimalist design with a gradient background, centered content,
 * and smooth fade-in-up captions. Ideal for thought-leadership content.
 *
 * Visual Style:
 * - Dark gradient background with subtle grain texture
 * - Large elegant title with a refined sans-serif font
 * - Supporting subtitle or body text
 * - Captions animate word-by-word with Fade In + Up
 *
 * Data format:
 * {
 *   templateId: "template-041",
 *   elements: {
 *     title: "string",
 *     subtitle: "string",
 *     caption: "string",
 *     captionTimestamps: [{word, start, end}],
 *     backgroundColor: "#hex"
 *   },
 *   duration: number
 * }
 */
const Template041 = React.memo(({ scene }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const elements = scene?.elements || {};
  const title = elements.title || '';
  const subtitle = elements.subtitle || '';
  const caption = elements.caption || '';
  const captionTimestamps = elements.captionTimestamps || null;
  const bgColor = elements.backgroundColor || backgroundColors.clean;

  // Subtle gradient animation
  const gradientShift = useMemo(() => ({
    background: `linear-gradient(135deg, ${bgColor} 0%, #1a1a3e 50%, #0d1117 100%)`,
  }), [bgColor]);

  // Title fade + slide up
  const titleOpacity = interpolate(frame, [0, 20], [0, 1], { extrapolateRight: 'clamp' });
  const titleY = interpolate(frame, [0, 25], [40, 0], { extrapolateRight: 'clamp' });

  // Subtitle fade (delayed)
  const subOpacity = interpolate(frame, [15, 35], [0, 1], { extrapolateRight: 'clamp' });

  // Decorative line
  const lineScaleX = interpolate(frame, [5, 20], [0, 1], { extrapolateRight: 'clamp' });

  return (
    <AbsoluteFill style={{ backgroundColor: bgColor }}>
      {/* Gradient background */}
      <div style={{
        position: 'absolute',
        top: 0, left: 0, right: 0, bottom: 0,
        ...gradientShift,
      }} />

      {/* Subtle grain overlay */}
      <div style={{
        position: 'absolute',
        top: 0, left: 0, right: 0, bottom: 0,
        opacity: 0.03,
        backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)'/%3E%3C/svg%3E")`,
      }} />

      {/* Content */}
      <div style={{
        position: 'relative',
        zIndex: 1,
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        alignItems: 'center',
        padding: '60px 80px',
        boxSizing: 'border-box',
      }}>
        {/* Title */}
        {title && (
          <h1 style={{
            color: '#ffffff',
            fontSize: 72,
            fontWeight: 300,
            fontFamily: "'Helvetica Neue', Helvetica, Arial, sans-serif",
            textAlign: 'center',
            margin: 0,
            marginBottom: 16,
            lineHeight: 1.15,
            letterSpacing: '-0.02em',
            opacity: titleOpacity,
            transform: `translateY(${titleY}px)`,
          }}>
            {title}
          </h1>
        )}

        {/* Decorative line */}
        <div style={{
          width: 80,
          height: 3,
          borderRadius: 2,
          background: 'linear-gradient(90deg, #60a5fa, #a78bfa)',
          marginBottom: 24,
          transform: `scaleX(${lineScaleX})`,
          opacity: titleOpacity,
        }} />

        {/* Subtitle */}
        {subtitle && (
          <p style={{
            color: '#94a3b8',
            fontSize: 32,
            fontWeight: 400,
            fontFamily: "'Helvetica Neue', Helvetica, Arial, sans-serif",
            textAlign: 'center',
            margin: 0,
            marginBottom: 40,
            maxWidth: '70%',
            lineHeight: 1.5,
            opacity: subOpacity,
          }}>
            {subtitle}
          </p>
        )}
      </div>

      {/* Animated Captions */}
      <CaptionRenderer
        text={caption}
        animation="fadeInUp"
        animationConfig={{ slideDistance: 15 }}
        styleConfig={{
          position: 'bottom',
          fontFamily: "'Helvetica Neue', Helvetica, Arial, sans-serif",
          fontWeight: 500,
          fontSize: 36,
          textColor: '#ffffff',
          backgroundColor: 'rgba(0, 0, 0, 0.4)',
          backgroundPadding: '10px 20px',
          borderRadius: 8,
          framesPerWord: 3,
          maxWidth: '75%',
        }}
        timestamps={captionTimestamps}
        fps={fps}
      />

      {/* Audio */}
      {scene?.audio?.file && (
        <Audio src={scene.audio.file} />
      )}
    </AbsoluteFill>
  );
});

Template041.displayName = 'Template041';

export default Template041;
