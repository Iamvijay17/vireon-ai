import React, { useMemo } from 'react';
import { AbsoluteFill, Audio, Img, interpolate, useCurrentFrame, useVideoConfig } from 'remotion';
import { CaptionRenderer } from '../../captions/CaptionRenderer';
import { mergeStyle, positionStyle } from '../../theme';

/**
 * 002-podcast template ("Interview" variant of the "podcast" scene type)
 *
 * Split-screen interview composition: a large framed host image fills the
 * left half with a lower-third name-plate stripe, while the right half
 * carries the show title/subtitle and waveform - a two-panel "conversation"
 * feel distinct from 001-podcast's single centered host layout. The data
 * shape only carries one host (no separate guest fields), so this stays
 * within "001-podcast"'s shape and gets its distinct look purely from
 * composition.
 *
 * Data format: same as "001-podcast" -
 * { title, subtitle, hostName, hostImage, caption, captionTimestamps, backgroundColor, styleConfig }
 * (styleConfig may carry accentColor).
 */
const Podcast002 = React.memo(({ scene }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const elements = scene?.elements || {};
  const title = elements.title || '';
  const subtitle = elements.subtitle || '';
  const hostImage = elements.hostImage || '';
  const hostName = elements.hostName || '';
  const caption = elements.caption || '';
  const captionTimestamps = elements.captionTimestamps || null;
  const bgColor = elements.backgroundColor || '#111827';
  const overrides = elements.styleConfig || {};
  const accentColor = overrides.accentColor || '#60a5fa';

  const bgGradient = useMemo(() => ({
    background: `linear-gradient(135deg, ${bgColor} 0%, #1e293b 50%, ${bgColor} 100%)`,
  }), [bgColor]);

  const panelSlide = interpolate(frame, [0, 25], [-40, 0], { extrapolateRight: 'clamp' });
  const panelOpacity = interpolate(frame, [0, 20], [0, 1], { extrapolateRight: 'clamp' });
  const imageScale = interpolate(frame, [0, 25], [0.92, 1], { extrapolateRight: 'clamp' });
  const nameplateY = interpolate(frame, [12, 32], [24, 0], { extrapolateRight: 'clamp' });
  const nameplateOpacity = interpolate(frame, [12, 32], [0, 1], { extrapolateRight: 'clamp' });
  const titleOpacity = interpolate(frame, [8, 26], [0, 1], { extrapolateRight: 'clamp' });
  const titleY = interpolate(frame, [8, 30], [24, 0], { extrapolateRight: 'clamp' });
  const subOpacity = interpolate(frame, [18, 36], [0, 1], { extrapolateRight: 'clamp' });

  const bars = useMemo(() => [1, 2, 3, 4, 5], []);
  const getBarHeight = (i) => interpolate(Math.sin(frame * 0.08 + i * 1.2), [-1, 1], [8, 32]);

  return (
    <AbsoluteFill style={{ backgroundColor: bgColor }}>
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, ...bgGradient }} />

      <div style={{ position: 'relative', zIndex: 1, width: '100%', height: '100%', display: 'flex', flexDirection: 'row' }}>
        {/* Left panel: framed host image with lower-third nameplate */}
        <div
          style={{
            flex: 1,
            position: 'relative',
            overflow: 'hidden',
            opacity: panelOpacity,
            transform: `translateX(${panelSlide}px)`,
          }}
        >
          {hostImage ? (
            <Img
              src={hostImage}
              style={{
                width: '100%',
                height: '100%',
                objectFit: 'cover',
                transform: `scale(${imageScale})`,
              }}
            />
          ) : (
            <div style={{ width: '100%', height: '100%', background: 'rgba(255,255,255,0.05)' }} />
          )}
          <div
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              background: `linear-gradient(0deg, ${bgColor}dd 0%, transparent 35%, transparent 100%)`,
            }}
          />
          {hostName && (
            <div
              style={{
                position: 'absolute',
                left: 0,
                bottom: 36,
                padding: '10px 28px',
                background: `${accentColor}cc`,
                borderRadius: '0 8px 8px 0',
                opacity: nameplateOpacity,
                transform: `translateY(${nameplateY}px)`,
              }}
            >
              <p style={{ color: '#0d1117', fontSize: 26, fontWeight: 800, fontFamily: "'Inter', 'Helvetica Neue', Arial, sans-serif", margin: 0 }}>
                {hostName}
              </p>
            </div>
          )}
        </div>

        {/* Right panel: title/subtitle + waveform */}
        <div
          style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            alignItems: 'flex-start',
            padding: '0 60px',
            boxSizing: 'border-box',
          }}
        >
          {title && (
            <h1
              data-style-role="title"
              style={mergeStyle(
                {
                  color: '#ffffff',
                  fontSize: 46,
                  fontWeight: 800,
                  fontFamily: "'Inter', 'Helvetica Neue', Arial, sans-serif",
                  textAlign: 'left',
                  margin: 0,
                  marginBottom: 10,
                  lineHeight: 1.2,
                  opacity: titleOpacity,
                  transform: `translateY(${titleY}px)`,
                  ...positionStyle(overrides.title?.position),
                },
                overrides.title
              )}
            >
              {title}
            </h1>
          )}

          {subtitle && (
            <p
              data-style-role="subtitle"
              style={mergeStyle(
                {
                  color: '#d1d5db',
                  fontSize: 22,
                  fontWeight: 400,
                  fontFamily: "'Inter', 'Helvetica Neue', Arial, sans-serif",
                  textAlign: 'left',
                  margin: 0,
                  marginBottom: 24,
                  opacity: subOpacity,
                  ...positionStyle(overrides.subtitle?.position),
                },
                overrides.subtitle
              )}
            >
              {subtitle}
            </p>
          )}

          <div style={{ display: 'flex', gap: 6, alignItems: 'center', height: 40, opacity: subOpacity }}>
            {bars.map((_, i) => (
              <div
                key={i}
                style={{
                  width: 4,
                  height: getBarHeight(i),
                  borderRadius: 2,
                  backgroundColor: accentColor,
                  opacity: 0.8,
                }}
              />
            ))}
          </div>
        </div>
      </div>

      <CaptionRenderer
        text={caption}
        animation="slideRight"
        animationConfig={{ slideDistance: 30 }}
        styleConfig={{
          position: 'bottom',
          fontFamily: "'Inter', 'Helvetica Neue', Arial, sans-serif",
          fontWeight: 700,
          fontSize: 38,
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

      {scene?.audio?.file && <Audio src={scene.audio.file} />}
    </AbsoluteFill>
  );
});

Podcast002.displayName = 'Podcast002';
export default Podcast002;
