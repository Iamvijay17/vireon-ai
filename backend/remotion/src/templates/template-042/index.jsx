import React, { useMemo } from 'react';
import { AbsoluteFill, Audio, Img, interpolate, useCurrentFrame, useVideoConfig } from 'remotion';
import { CaptionRenderer } from '../../captions/CaptionRenderer';
import { backgroundColors } from '../../styles';

/**
 * Template 042 - Podcast
 *
 * A vibrant, conversational design with host profile image, show branding,
 * and dynamic highlighted-word captions. Perfect for interview and podcast clips.
 *
 * Visual Style:
 * - Gradient background with warm accent colors
 * - Circular profile image with glow border
 * - Bold show/episode title
 * - Captions use Highlight Current Word animation
 *
 * Data format:
 * {
 *   templateId: "template-042",
 *   elements: {
 *     title: "string",
 *     subtitle: "string (episode name)",
 *     hostImage: "url",
 *     hostName: "string",
 *     caption: "string",
 *     captionTimestamps: [{word, start, end}],
 *     backgroundColor: "#hex",
 *     accentColor: "#hex"
 *   },
 *   duration: number
 * }
 */
const Template042 = React.memo(({ scene }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const elements = scene?.elements || {};
  const title = elements.title || '';
  const subtitle = elements.subtitle || '';
  const hostImage = elements.hostImage || '';
  const hostName = elements.hostName || '';
  const caption = elements.caption || '';
  const captionTimestamps = elements.captionTimestamps || null;
  const bgColor = elements.backgroundColor || '#1a0a2e';
  const accentColor = elements.accentColor || '#f97316';

  // Warm gradient background
  const bgGradient = useMemo(() => ({
    background: `radial-gradient(ellipse at 30% 20%, ${bgColor} 0%, #2d1b00 60%, #1a0a2e 100%)`,
  }), [bgColor]);

  // Title slide up
  const titleOpacity = interpolate(frame, [0, 15], [0, 1], { extrapolateRight: 'clamp' });
  const titleY = interpolate(frame, [0, 20], [30, 0], { extrapolateRight: 'clamp' });

  // Subtitle fade
  const subOpacity = interpolate(frame, [10, 25], [0, 1], { extrapolateRight: 'clamp' });

  // Image scale + border glow
  const imageScale = interpolate(frame, [0, 20], [0.8, 1], { extrapolateRight: 'clamp' });
  const glowOpacity = interpolate(frame, [5, 25], [0, 1], { extrapolateRight: 'clamp' });

  // Audio wave bars animation
  const bars = useMemo(() => [1, 2, 3, 4, 5], []);
  const getBarHeight = (i) => {
    return interpolate(
      Math.sin(frame * 0.08 + i * 1.2),
      [-1, 1],
      [8, 32]
    );
  };

  return (
    <AbsoluteFill style={{ backgroundColor: bgColor }}>
      {/* Background gradient */}
      <div style={{
        position: 'absolute',
        top: 0, left: 0, right: 0, bottom: 0,
        ...bgGradient,
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
        padding: '60px',
        boxSizing: 'border-box',
      }}>
        {/* Top section: Host image + branding */}
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          marginBottom: 30,
          opacity: imageScale,
        }}>
          {/* Circular host image with glow */}
          {hostImage && (
            <div style={{
              width: 120,
              height: 120,
              borderRadius: '50%',
              overflow: 'hidden',
              border: `3px solid ${accentColor}`,
              boxShadow: `0 0 30px ${accentColor}60, 0 0 60px ${accentColor}30`,
              transform: `scale(${imageScale})`,
              marginBottom: 16,
            }}>
              <Img src={hostImage} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            </div>
          )}

          {/* Host name */}
          {hostName && (
            <p style={{
              color: accentColor,
              fontSize: 20,
              fontWeight: 600,
              fontFamily: "'Inter', 'Helvetica Neue', Arial, sans-serif",
              textTransform: 'uppercase',
              letterSpacing: 3,
              margin: 0,
              marginBottom: 4,
              opacity: glowOpacity,
            }}>
              {hostName}
            </p>
          )}
        </div>

        {/* Show title */}
        {title && (
          <h1 style={{
            color: '#ffffff',
            fontSize: 56,
            fontWeight: 800,
            fontFamily: "'Inter', 'Helvetica Neue', Arial, sans-serif",
            textAlign: 'center',
            margin: 0,
            marginBottom: 8,
            lineHeight: 1.2,
            opacity: titleOpacity,
            transform: `translateY(${titleY}px)`,
          }}>
            {title}
          </h1>
        )}

        {/* Episode subtitle */}
        {subtitle && (
          <p style={{
            color: '#d1d5db',
            fontSize: 24,
            fontWeight: 400,
            fontFamily: "'Inter', 'Helvetica Neue', Arial, sans-serif",
            textAlign: 'center',
            margin: 0,
            marginBottom: 16,
            opacity: subOpacity,
          }}>
            {subtitle}
          </p>
        )}

        {/* Audio wave visualizer */}
        <div style={{
          display: 'flex',
          gap: 6,
          alignItems: 'center',
          height: 40,
          marginBottom: 20,
          opacity: subOpacity,
        }}>
          {bars.map((_, i) => (
            <div key={i} style={{
              width: 4,
              height: getBarHeight(i),
              borderRadius: 2,
              backgroundColor: accentColor,
              opacity: 0.8,
            }} />
          ))}
        </div>
      </div>

      {/* Animated Captions */}
      <CaptionRenderer
        text={caption}
        animation="highlightCurrent"
        animationConfig={{ highlightColor: accentColor }}
        styleConfig={{
          position: 'bottom',
          fontFamily: "'Inter', 'Helvetica Neue', Arial, sans-serif",
          fontWeight: 700,
          fontSize: 40,
          textColor: '#ffffff',
          backgroundColor: 'rgba(0, 0, 0, 0.6)',
          backgroundPadding: '14px 28px',
          borderRadius: 16,
          framesPerWord: 3,
          maxWidth: '85%',
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

Template042.displayName = 'Template042';

export default Template042;
