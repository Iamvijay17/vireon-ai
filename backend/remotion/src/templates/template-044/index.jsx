import React, { useMemo } from 'react';
import { AbsoluteFill, Audio, Img, interpolate, useCurrentFrame, useVideoConfig } from 'remotion';
import { CaptionRenderer } from '../../captions/CaptionRenderer';
import { backgroundColors } from '../../styles';

/**
 * Template 044 - Social Media
 *
 * A vibrant, trendy template optimized for short-form vertical content
 * (TikTok, Reels, Shorts). Features bold typography, pop-scale captions,
 * a profile picture, and like/comment engagement indicators.
 *
 * Visual Style:
 * - Bright gradient background with abstract shapes
 * - Large, bold, modern typography
 * - Circular profile picture (top-left)
 * - Engagement bar (like/share icons)
 * - Captions use Pop Scale animation (TikTok-style)
 *
 * Data format:
 * {
 *   templateId: "template-044",
 *   elements: {
 *     title: "string",
 *     body: "string",
 *     profileImage: "url",
 *     username: "string",
 *     likes: "string (e.g., 12.4K)",
 *     caption: "string",
 *     captionTimestamps: [{word, start, end}],
 *     backgroundColor: "#hex",
 *     accentColor: "#hex"
 *   },
 *   duration: number
 * }
 */
const Template044 = React.memo(({ scene }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const elements = scene?.elements || {};
  const title = elements.title || '';
  const body = elements.body || '';
  const profileImage = elements.profileImage || '';
  const username = elements.username || '';
  const likes = elements.likes || '';
  const caption = elements.caption || '';
  const captionTimestamps = elements.captionTimestamps || null;
  const bgColor = elements.backgroundColor || '#1a0030';
  const accentColor = elements.accentColor || '#ff6b9d';

  // Vibrant gradient background
  const bgGradient = useMemo(() => ({
    background: `linear-gradient(135deg, ${bgColor} 0%, #2d1b69 40%, #4a0e4e 70%, ${bgColor} 100%)`,
  }), [bgColor]);

  // Abstract floating circles
  const circle1Y = interpolate(frame, [0, 60], [0, -20], { extrapolateRight: 'clamp' });
  const circle2X = interpolate(frame, [0, 60], [0, 15], { extrapolateRight: 'clamp' });
  const circle3Opacity = interpolate(
    Math.sin(frame * 0.05),
    [-1, 1],
    [0.1, 0.4]
  );

  // Profile section animation
  const profileOpacity = interpolate(frame, [0, 12], [0, 1], { extrapolateRight: 'clamp' });
  const profileSlide = interpolate(frame, [0, 14], [-20, 0], { extrapolateRight: 'clamp' });

  // Title pop-in
  const titleScale = interpolate(frame, [5, 20], [0.5, 1], { extrapolateRight: 'clamp' });
  const titleOpacity = interpolate(frame, [5, 15], [0, 1], { extrapolateRight: 'clamp' });

  // Body fade
  const bodyOpacity = interpolate(frame, [18, 35], [0, 1], { extrapolateRight: 'clamp' });

  // Likes counter animation
  const likesCount = Math.min(Math.floor(frame * 200), parseInt(likes) || 12400);
  const likesFormatted = useMemo(() => {
    if (likesCount >= 1000000) return `${(likesCount / 1000000).toFixed(1)}M`;
    if (likesCount >= 1000) return `${(likesCount / 1000).toFixed(1)}K`;
    return likesCount.toString();
  }, [likesCount]);

  // Heart icon pulse
  const heartScale = interpolate(
    Math.sin(frame * 0.1),
    [-1, 1],
    [1, 1.15]
  );

  return (
    <AbsoluteFill style={{ backgroundColor: bgColor }}>
      {/* Gradient background */}
      <div style={{
        position: 'absolute',
        top: 0, left: 0, right: 0, bottom: 0,
        ...bgGradient,
      }} />

      {/* Abstract floating circles */}
      <div style={{
        position: 'absolute',
        top: '15%',
        right: '10%',
        width: 200,
        height: 200,
        borderRadius: '50%',
        background: `radial-gradient(circle, ${accentColor}40, transparent)`,
        transform: `translateY(${circle1Y}px)`,
        opacity: 0.3,
      }} />
      <div style={{
        position: 'absolute',
        bottom: '20%',
        left: '5%',
        width: 150,
        height: 150,
        borderRadius: '50%',
        background: `radial-gradient(circle, #a78bfa40, transparent)`,
        transform: `translateX(${circle2X}px)`,
        opacity: circle3Opacity,
      }} />

      {/* Top bar: Profile + Username */}
      <div style={{
        position: 'absolute',
        top: 24,
        left: 24,
        right: 24,
        zIndex: 2,
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        opacity: profileOpacity,
        transform: `translateX(${profileSlide}px)`,
      }}>
        {profileImage && (
          <div style={{
            width: 44,
            height: 44,
            borderRadius: '50%',
            overflow: 'hidden',
            border: `2px solid ${accentColor}`,
          }}>
            <Img src={profileImage} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          </div>
        )}
        {username && (
          <span style={{
            color: '#ffffff',
            fontSize: 20,
            fontWeight: 700,
            fontFamily: "'Inter', 'Helvetica Neue', Arial, sans-serif",
          }}>
            {username}
          </span>
        )}
      </div>

      {/* Main content */}
      <div style={{
        position: 'relative',
        zIndex: 1,
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        alignItems: 'center',
        padding: '80px 40px',
        boxSizing: 'border-box',
      }}>
        {/* Title */}
        {title && (
          <h1 style={{
            color: '#ffffff',
            fontSize: 60,
            fontWeight: 900,
            fontFamily: "'Inter', 'Helvetica Neue', Arial, sans-serif",
            textAlign: 'center',
            margin: 0,
            marginBottom: 12,
            lineHeight: 1.1,
            letterSpacing: '-0.03em',
            transform: `scale(${titleScale})`,
            opacity: titleOpacity,
          }}>
            {title}
          </h1>
        )}

        {/* Body */}
        {body && (
          <p style={{
            color: '#e2e8f0',
            fontSize: 28,
            fontWeight: 500,
            fontFamily: "'Inter', 'Helvetica Neue', Arial, sans-serif",
            textAlign: 'center',
            margin: 0,
            maxWidth: '80%',
            lineHeight: 1.4,
            opacity: bodyOpacity,
          }}>
            {body}
          </p>
        )}
      </div>

      {/* Bottom engagement bar */}
      {likes && (
        <div style={{
          position: 'absolute',
          bottom: 100,
          left: 0,
          right: 0,
          zIndex: 2,
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          gap: 8,
        }}>
          <span style={{ fontSize: 28, transform: `scale(${heartScale})`, display: 'inline-block' }}>
            ❤️
          </span>
          <span style={{
            color: '#ffffff',
            fontSize: 22,
            fontWeight: 700,
            fontFamily: "'Inter', 'Helvetica Neue', Arial, sans-serif",
          }}>
            {likesFormatted}
          </span>
        </div>
      )}

      {/* Animated Captions */}
      <CaptionRenderer
        text={caption}
        animation="popScale"
        styleConfig={{
          position: 'bottom',
          fontFamily: "'Inter', 'Helvetica Neue', Arial, sans-serif",
          fontWeight: 800,
          fontSize: 38,
          textColor: '#ffffff',
          strokeColor: '#000000',
          strokeWidth: 3,
          backgroundColor: 'rgba(0, 0, 0, 0.5)',
          backgroundPadding: '12px 24px',
          borderRadius: 12,
          framesPerWord: 3,
          maxWidth: '85%',
          bottom: 130,
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

Template044.displayName = 'Template044';

export default Template044;
