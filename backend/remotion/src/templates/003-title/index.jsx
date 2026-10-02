import React, { useLayoutEffect, useMemo, useRef } from 'react';
import gsap from 'gsap';
import { AbsoluteFill, Audio, Img, useCurrentFrame, useVideoConfig } from 'remotion';
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
  const { width, height, fps } = useVideoConfig();
  // Fixed-px avatar/accent-line sizing below is tuned for a 1920-wide
  // canvas - scale it against the shorter canvas dimension so it isn't
  // oversized/cramped on portrait/square.
  const scale = Math.min(width, height) / 1080;
  const elements = scene?.elements || {};
  const title = elements.title || '';
  const subtitle = elements.subtitle || '';
  const image = elements.image || '';
  const bgColor = elements.backgroundColor || backgroundColors.clean;
  const overrides = elements.styleConfig || {};
  const accentColor = overrides.accentColor;
  const hasTitleOverride = Boolean(overrides.title?.position);
  const hasSubtitleOverride = Boolean(overrides.subtitle?.position);

  const gradientShift = useMemo(() => ({
    background: `linear-gradient(135deg, ${bgColor} 0%, #1a1a3e 50%, #0d1117 100%)`,
  }), [bgColor]);

  // GSAP timeline driven by Remotion's frame instead of real time: the
  // timeline stays paused and is seeked to `frame / fps` on every render, so
  // it renders identically whether played back live or captured frame-by-
  // frame out of order during server-side rendering.
  const titleRef = useRef(null);
  const lineRef = useRef(null);
  const subtitleRef = useRef(null);
  const imageRef = useRef(null);
  const timeline = useMemo(() => gsap.timeline({ paused: true }), []);

  useLayoutEffect(() => {
    timeline.clear();

    if (image && imageRef.current) {
      timeline.fromTo(
        imageRef.current,
        { opacity: 0, scale: 0.25, rotation: -12 },
        { opacity: 1, scale: 1, rotation: 0, duration: 1.1, ease: 'elastic.out(1, 0.55)' },
        0.15
      );
    }
    if (!hasTitleOverride && titleRef.current) {
      timeline
        .fromTo(titleRef.current, { opacity: 0 }, { opacity: 1, duration: 0.4, ease: 'power1.out' }, 0.3)
        .fromTo(
          titleRef.current,
          { y: 220, scale: 0.7 },
          { y: 0, scale: 1, duration: 1.2, ease: 'elastic.out(1, 0.5)' },
          0.3
        );
    }
    if (lineRef.current) {
      timeline.fromTo(lineRef.current, { scaleX: 0 }, { scaleX: 1, duration: 0.9, ease: 'elastic.out(1, 0.4)' }, 1.1);
    }
    if (!hasSubtitleOverride && subtitleRef.current) {
      timeline
        .fromTo(subtitleRef.current, { opacity: 0 }, { opacity: 1, duration: 0.5, ease: 'power1.out' }, 1.4)
        .fromTo(subtitleRef.current, { y: 60 }, { y: 0, duration: 0.7, ease: 'back.out(2.5)' }, 1.4);
    }
  }, [timeline, fps, hasTitleOverride, hasSubtitleOverride, image]);

  useLayoutEffect(() => {
    timeline.seek(frame / fps, false);
  }, [timeline, frame, fps]);

  const titleStyle = mergeStyle(
    { ...typography.title, fontSize: typography.title.fontSize * scale, marginBottom: spacing.md, ...positionStyle(overrides.title?.position) },
    overrides.title
  );
  const subtitleStyle = mergeStyle(
    { ...typography.subtitle, fontSize: typography.subtitle.fontSize * scale, maxWidth: '70%', ...positionStyle(overrides.subtitle?.position) },
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
          padding: `${spacing.xxl * scale}px ${spacing.xxxl * scale}px`,
          boxSizing: 'border-box',
        }}
      >
        {image && (
          <div
            ref={imageRef}
            style={{
              width: 220 * scale,
              height: 220 * scale,
              borderRadius: '50%',
              overflow: 'hidden',
              marginBottom: spacing.xl,
              boxShadow: '0 12px 40px rgba(0,0,0,0.35)',
            }}
          >
            <Img src={image} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          </div>
        )}

        {title && (
          <h1
            data-style-role="title"
            ref={hasTitleOverride ? null : titleRef}
            style={hasTitleOverride ? { ...titleStyle, opacity: 1 } : titleStyle}
          >
            {title}
          </h1>
        )}

        <div
          ref={lineRef}
          style={{
            width: 64 * scale,
            height: 2,
            borderRadius: 1,
            backgroundColor: accentColor || '#60a5fa',
            margin: `${spacing.md}px 0`,
            transformOrigin: 'center center',
          }}
        />

        {subtitle && (
          <p
            data-style-role="subtitle"
            ref={hasSubtitleOverride ? null : subtitleRef}
            style={hasSubtitleOverride ? { ...subtitleStyle, opacity: 1 } : subtitleStyle}
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
