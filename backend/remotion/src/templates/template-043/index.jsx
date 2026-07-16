import React, { useMemo } from 'react';
import { AbsoluteFill, Audio, Img, interpolate, useCurrentFrame, useVideoConfig } from 'remotion';
import { CaptionRenderer } from '../../captions/CaptionRenderer';
import { backgroundColors } from '../../styles';

/**
 * Template 043 - News
 *
 * A professional broadcast-style template with a lower-third ticker,
 * headline overlay, and clean sliding captions. Suitable for news clips,
 * announcements, and breaking stories.
 *
 * Visual Style:
 * - Dark blue/charcoal background with red accent bar at top
 * - Bold white headline with drop shadow
 * - "BREAKING" or category badge in top-left
 * - Lower-third ticker area at bottom
 * - Captions use Slide Left animation
 *
 * Data format:
 * {
 *   templateId: "template-043",
 *   elements: {
 *     headline: "string",
 *     body: "string",
 *     badge: "string (e.g., BREAKING, EXCLUSIVE)",
 *     image: "url (optional hero image)",
 *     caption: "string",
 *     captionTimestamps: [{word, start, end}],
 *     backgroundColor: "#hex",
 *     accentColor: "#hex"
 *   },
 *   duration: number
 * }
 */
const Template043 = React.memo(({ scene }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const elements = scene?.elements || {};
  const headline = elements.headline || '';
  const body = elements.body || '';
  const badge = elements.badge || '';
  const image = elements.image || '';
  const caption = elements.caption || '';
  const captionTimestamps = elements.captionTimestamps || null;
  const bgColor = elements.backgroundColor || '#0a1628';
  const accentColor = elements.accentColor || '#ef4444';

  // Background gradient
  const bgGradient = useMemo(() => ({
    background: `linear-gradient(180deg, ${bgColor} 0%, #121e3a 50%, ${bgColor} 100%)`,
  }), [bgColor]);

  // Top accent bar animation
  const barSlide = interpolate(frame, [0, 10], [-100, 0], { extrapolateRight: 'clamp' });

  // Badge fall-in
  const badgeOpacity = interpolate(frame, [5, 15], [0, 1], { extrapolateRight: 'clamp' });
  const badgeSlide = interpolate(frame, [5, 18], [-30, 0], { extrapolateRight: 'clamp' });

  // Headline fade + slide up
  const headlineOpacity = interpolate(frame, [10, 30], [0, 1], { extrapolateRight: 'clamp' });
  const headlineY = interpolate(frame, [10, 30], [40, 0], { extrapolateRight: 'clamp' });

  // Body text fade (delayed)
  const bodyOpacity = interpolate(frame, [25, 45], [0, 1], { extrapolateRight: 'clamp' });

  // Image zoom/pan (Ken Burns effect)
  const imageScale = interpolate(frame, [0, 60], [1, 1.05], { extrapolateRight: 'clamp' });
  const imageX = interpolate(frame, [0, 60], [0, -10], { extrapolateRight: 'clamp' });

  // Lower third ticker border animation
  const tickerBorderWidth = interpolate(frame, [0, 20], [0, 1], { extrapolateRight: 'clamp' });

  return (
    <AbsoluteFill style={{ backgroundColor: bgColor }}>
      {/* Background gradient */}
      <div style={{
        position: 'absolute',
        top: 0, left: 0, right: 0, bottom: 0,
        ...bgGradient,
      }} />

      {/* Top accent bar */}
      <div style={{
        position: 'absolute',
        top: 0, left: 0, right: 0,
        height: 4,
        backgroundColor: accentColor,
        transform: `translateX(${barSlide}%)`,
        zIndex: 2,
      }} />

      {/* Hero image (background) */}
      {image && (
        <div style={{
          position: 'absolute',
          top: 0, left: 0, right: 0,
          height: '60%',
          overflow: 'hidden',
          opacity: 0.3,
        }}>
          <Img
            src={image}
            style={{
              width: '100%',
              height: '100%',
              objectFit: 'cover',
              transform: `scale(${imageScale}) translateX(${imageX}px)`,
            }}
          />
          {/* Gradient overlay */}
          <div style={{
            position: 'absolute',
            bottom: 0, left: 0, right: 0,
            height: '50%',
            background: 'linear-gradient(transparent, #0a1628)',
          }} />
        </div>
      )}

      {/* Content */}
      <div style={{
        position: 'relative',
        zIndex: 1,
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        alignItems: 'flex-start',
        padding: '80px 60px 160px',
        boxSizing: 'border-box',
      }}>
        {/* Badge */}
        {badge && (
          <div style={{
            backgroundColor: accentColor,
            color: '#ffffff',
            fontSize: 18,
            fontWeight: 800,
            fontFamily: "'Georgia', 'Times New Roman', serif",
            textTransform: 'uppercase',
            letterSpacing: 3,
            padding: '6px 18px',
            marginBottom: 20,
            opacity: badgeOpacity,
            transform: `translateX(${badgeSlide}px)`,
          }}>
            {badge}
          </div>
        )}

        {/* Headline */}
        {headline && (
          <h1 style={{
            color: '#ffffff',
            fontSize: 64,
            fontWeight: 900,
            fontFamily: "'Georgia', 'Times New Roman', serif",
            textAlign: 'left',
            margin: 0,
            marginBottom: 16,
            maxWidth: '80%',
            lineHeight: 1.15,
            textShadow: '0 2px 20px rgba(0, 0, 0, 0.5)',
            opacity: headlineOpacity,
            transform: `translateY(${headlineY}px)`,
          }}>
            {headline}
          </h1>
        )}

        {/* Body */}
        {body && (
          <p style={{
            color: '#cbd5e1',
            fontSize: 28,
            fontWeight: 400,
            fontFamily: "'Georgia', 'Times New Roman', serif",
            textAlign: 'left',
            margin: 0,
            maxWidth: '70%',
            lineHeight: 1.5,
            opacity: bodyOpacity,
          }}>
            {body}
          </p>
        )}
      </div>

      {/* Lower third decorative line */}
      <div style={{
        position: 'absolute',
        bottom: 100,
        left: 60,
        right: 60,
        height: 1,
        backgroundColor: 'rgba(255, 255, 255, 0.15)',
        transform: `scaleX(${tickerBorderWidth})`,
        transformOrigin: 'left',
        zIndex: 2,
      }} />

      {/* Animated Captions */}
      <CaptionRenderer
        text={caption}
        animation="slideLeft"
        animationConfig={{ slideDistance: 40 }}
        styleConfig={{
          position: 'bottom',
          fontFamily: "'Georgia', 'Times New Roman', serif",
          fontWeight: 600,
          fontSize: 34,
          textColor: '#ffffff',
          strokeColor: '#000000',
          strokeWidth: 3,
          backgroundColor: 'rgba(10, 22, 40, 0.8)',
          backgroundPadding: '12px 24px',
          borderRadius: 6,
          framesPerWord: 3,
          maxWidth: '85%',
          bottom: 40,
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

Template043.displayName = 'Template043';

export default Template043;
