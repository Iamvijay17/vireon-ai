import React, { useMemo } from 'react';
import { AbsoluteFill, Audio, Img, interpolate, useCurrentFrame, useVideoConfig, spring } from 'remotion';
import { CaptionRenderer } from '../../captions/CaptionRenderer';

/**
 * Template 045 - Cinematic
 *
 * A dramatic, film-inspired template with letterbox bars, vignette,
 * slow zoom, and elegant blur-to-sharp captions. Perfect for trailers,
 * documentary clips, and storytelling content.
 *
 * Visual Style:
 * - Widescreen letterbox (black bars top/bottom)
 * - Vignette overlay
 * - Slow Ken Burns zoom on background image
 * - Film grain texture overlay
 * - Captions use Blur to Sharp animation
 * - Fade-in title with cinematic serif font
 *
 * Data format:
 * {
 *   templateId: "template-045",
 *   elements: {
 *     title: "string",
 *     subtitle: "string",
 *     backgroundImage: "url",
 *     caption: "string",
 *     captionTimestamps: [{word, start, end}],
 *     backgroundColor: "#hex"
 *   },
 *   duration: number
 * }
 */
const Template045 = React.memo(({ scene }) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  const elements = scene?.elements || {};
  const title = elements.title || '';
  const subtitle = elements.subtitle || '';
  const backgroundImage = elements.backgroundImage || '';
  const caption = elements.caption || '';
  const captionTimestamps = elements.captionTimestamps || null;
  const bgColor = elements.backgroundColor || '#0a0a0a';
  const textColor = elements.textColor || '#f5f5f0';

  // Background gradient
  const bgGradient = useMemo(() => ({
    background: `linear-gradient(180deg, #0a0a0a 0%, #1a1a1a 50%, #0a0a0a 100%)`,
  }), []);

  // Slow zoom effect (Ken Burns)
  const bgScale = interpolate(frame, [0, durationInFrames || 120], [1.0, 1.08], {
    extrapolateRight: 'clamp',
  });
  const bgX = interpolate(frame, [0, durationInFrames || 120], [0, -8], {
    extrapolateRight: 'clamp',
  });

  // Vignette overlay opacity
  const vignetteOpacity = interpolate(frame, [0, 15], [0.6, 0.8], {
    extrapolateRight: 'clamp',
  });

  // Letterbox bar animation (slide in)
  const topBarSlide = spring({
    frame,
    fps,
    config: { damping: 15, mass: 0.8, stiffness: 100 },
  });
  const barHeight = 120 * topBarSlide;

  // Title fade in with slow reveal
  const titleOpacity = interpolate(frame, [10, 40], [0, 1], { extrapolateRight: 'clamp' });
  const titleY = interpolate(frame, [10, 45], [30, 0], { extrapolateRight: 'clamp' });

  // Subtitle fade (delayed, more subtle)
  const subOpacity = interpolate(frame, [30, 55], [0, 1], { extrapolateRight: 'clamp' });

  // Film grain flicker
  const grainOpacity = interpolate(
    Math.sin(frame * 0.3 + 1.7) * Math.cos(frame * 0.17 + 3.2),
    [-1, 1],
    [0.02, 0.06]
  );

  // Inner content scale (subtle breathing)
  const contentBreath = interpolate(
    Math.sin(frame * 0.02),
    [-1, 1],
    [0.98, 1.0]
  );

  return (
    <AbsoluteFill style={{ backgroundColor: '#000000' }}>
      {/* Background layer */}
      <div style={{
        position: 'absolute',
        top: 0, left: 0, right: 0, bottom: 0,
      }}>
        {backgroundImage ? (
          <>
            <Img
              src={backgroundImage}
              style={{
                width: '100%',
                height: '100%',
                objectFit: 'cover',
                transform: `scale(${bgScale}) translateX(${bgX}px)`,
              }}
            />
            {/* Dark overlay */}
            <div style={{
              position: 'absolute',
              top: 0, left: 0, right: 0, bottom: 0,
              background: `linear-gradient(180deg, rgba(0,0,0,0.4) 0%, rgba(0,0,0,0.2) 50%, rgba(0,0,0,0.5) 100%)`,
            }} />
          </>
        ) : (
          <div style={{
            position: 'absolute',
            top: 0, left: 0, right: 0, bottom: 0,
            ...bgGradient,
          }} />
        )}
      </div>

      {/* Vignette */}
      <div style={{
        position: 'absolute',
        top: 0, left: 0, right: 0, bottom: 0,
        background: 'radial-gradient(ellipse at center, transparent 50%, rgba(0,0,0,0.9) 100%)',
        opacity: vignetteOpacity,
      }} />

      {/* Film grain */}
      <div style={{
        position: 'absolute',
        top: 0, left: 0, right: 0, bottom: 0,
        opacity: grainOpacity,
        backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.65' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)'/%3E%3C/svg%3E")`,
        mixBlendMode: 'overlay',
      }} />

      {/* Letterbox bars */}
      <div style={{
        position: 'absolute',
        top: 0, left: 0, right: 0,
        height: barHeight,
        backgroundColor: '#000000',
        zIndex: 3,
      }} />
      <div style={{
        position: 'absolute',
        bottom: 0, left: 0, right: 0,
        height: barHeight,
        backgroundColor: '#000000',
        zIndex: 3,
      }} />

      {/* Content (between letterbox) */}
      <div style={{
        position: 'relative',
        zIndex: 2,
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        alignItems: 'center',
        padding: `${barHeight + 40}px 80px`,
        boxSizing: 'border-box',
        transform: `scale(${contentBreath})`,
      }}>
        {/* Title */}
        {title && (
          <h1 style={{
            color: textColor,
            fontSize: 72,
            fontWeight: 400,
            fontFamily: "'Playfair Display', 'Georgia', serif",
            textAlign: 'center',
            margin: 0,
            marginBottom: 20,
            lineHeight: 1.15,
            letterSpacing: '0.05em',
            opacity: titleOpacity,
            transform: `translateY(${titleY}px)`,
            textShadow: '0 4px 30px rgba(0, 0, 0, 0.5)',
          }}>
            {title}
          </h1>
        )}

        {/* Subtitle */}
        {subtitle && (
          <p style={{
            color: '#a8a8a0',
            fontSize: 28,
            fontWeight: 300,
            fontFamily: "'Playfair Display', 'Georgia', serif",
            textAlign: 'center',
            margin: 0,
            maxWidth: '65%',
            lineHeight: 1.5,
            fontStyle: 'italic',
            opacity: subOpacity,
          }}>
            {subtitle}
          </p>
        )}
      </div>

      {/* Animated Captions */}
      <CaptionRenderer
        text={caption}
        animation="blurToSharp"
        styleConfig={{
          position: 'bottom',
          fontFamily: "'Playfair Display', 'Georgia', serif",
          fontWeight: 600,
          fontSize: 32,
          textColor: '#f5f5f0',
          strokeColor: '#000000',
          strokeWidth: 3,
          backgroundColor: 'rgba(0, 0, 0, 0.6)',
          backgroundPadding: '10px 22px',
          borderRadius: 4,
          framesPerWord: 4,
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

Template045.displayName = 'Template045';

export default Template045;
