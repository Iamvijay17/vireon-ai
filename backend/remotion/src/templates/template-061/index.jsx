import React, { useMemo } from 'react';
import { AbsoluteFill, Audio, Img, interpolate, useCurrentFrame, useVideoConfig } from 'remotion';
import { CaptionRenderer } from '../../captions/CaptionRenderer';

/**
 * Template 061 - Podcast Dialogue
 *
 * Two-voice conversational podcast look: one shared full-bleed cover image
 * behind every turn (host + guest scenes share the same background so the
 * episode reads as one continuous conversation), an animated waveform that
 * reacts while that turn's audio plays, a small nameplate showing who is
 * currently speaking, and word-by-word captions.
 *
 * Data format:
 * {
 *   templateId: "template-061",
 *   speaker: "host" | "guest",
 *   imageUrl: "url",           // shared cover art, top-level scene field
 *   elements: {
 *     caption: "string",
 *     captionTimestamps: [{word, start, end}],
 *     speakerLabel: "Host" | "Guest"
 *   },
 *   duration: number
 * }
 */
const Template061 = React.memo(({ scene }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const elements = scene?.elements || {};
  const caption = elements.caption || '';
  const captionTimestamps = elements.captionTimestamps || null;
  const speakerLabel = elements.speakerLabel || (scene?.speaker === 'guest' ? 'Guest' : 'Host');
  const isGuest = speakerLabel.toLowerCase() === 'guest';
  const backgroundImage = scene?.imageUrl || '';
  const accentColor = isGuest ? '#22d3ee' : '#f97316';

  // Without real per-word timestamps (captionTimestamps is always null - no
  // forced-alignment step exists yet), CaptionRenderer's fallback paces
  // words at a fixed framesPerWord regardless of how long this turn's line
  // actually is. But we DO know the scene's exact duration - it's set to the
  // real TTS audio length in VideoService.updateSceneAudio - so spread the
  // words evenly across that instead of a fixed guess, keeping captions in
  // sync with speech regardless of turn length.
  const wordCount = useMemo(() => (caption ? caption.split(/\s+/).filter(Boolean).length : 0), [caption]);
  const sceneDurationFrames = (scene?.duration || 8) * fps;
  const dynamicFramesPerWord = wordCount > 0 ? Math.max(1, sceneDurationFrames / wordCount) : 3;

  const entryOpacity = interpolate(frame, [0, 12], [0, 1], { extrapolateRight: 'clamp' });

  // Fake amplitude-reactive waveform bars, same sine-driven technique used
  // by template-042's audio visualizer (no real audio analysis available).
  const bars = useMemo(() => Array.from({ length: 7 }, (_, i) => i), []);
  const getBarHeight = (i) => {
    const wobble = interpolate(
      Math.sin(frame * 0.35 + i * 0.9) * Math.cos(frame * 0.12 + i),
      [-1, 1],
      [10, 46]
    );
    return wobble;
  };

  return (
    <AbsoluteFill style={{ backgroundColor: '#0a0a0a' }}>
      {/* Shared cover art background */}
      {backgroundImage ? (
        <Img
          src={backgroundImage}
          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
        />
      ) : (
        <AbsoluteFill
          style={{ background: 'radial-gradient(ellipse at 30% 20%, #2d1b00 0%, #1a0a2e 60%, #0a0a0a 100%)' }}
        />
      )}

      {/* Dark overlay for legibility */}
      <AbsoluteFill
        style={{ background: 'linear-gradient(180deg, rgba(0,0,0,0.35) 0%, rgba(0,0,0,0.15) 45%, rgba(0,0,0,0.75) 100%)' }}
      />

      {/* Speaker nameplate */}
      <div
        style={{
          position: 'absolute',
          top: 50,
          left: isGuest ? 'auto' : 60,
          right: isGuest ? 60 : 'auto',
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          padding: '10px 20px',
          borderRadius: 999,
          backgroundColor: 'rgba(0,0,0,0.55)',
          border: `2px solid ${accentColor}`,
          opacity: entryOpacity,
        }}
      >
        <div style={{ width: 10, height: 10, borderRadius: '50%', backgroundColor: accentColor }} />
        <span
          style={{
            color: '#ffffff',
            fontFamily: "'Inter', 'Helvetica Neue', Arial, sans-serif",
            fontWeight: 700,
            fontSize: 22,
            textTransform: 'uppercase',
            letterSpacing: 2,
          }}
        >
          {speakerLabel}
        </span>
      </div>

      {/* Waveform visualizer */}
      <div
        style={{
          position: 'absolute',
          bottom: 220,
          left: '50%',
          transform: 'translateX(-50%)',
          display: 'flex',
          gap: 8,
          alignItems: 'center',
          height: 50,
          opacity: entryOpacity,
        }}
      >
        {bars.map((i) => (
          <div
            key={i}
            style={{
              width: 6,
              height: getBarHeight(i),
              borderRadius: 3,
              backgroundColor: accentColor,
              opacity: 0.85,
            }}
          />
        ))}
      </div>

      {/* Captions */}
      <CaptionRenderer
        text={caption}
        animation="highlightCurrent"
        animationConfig={{ highlightColor: accentColor }}
        styleConfig={{
          position: 'bottom',
          fontFamily: "'Inter', 'Helvetica Neue', Arial, sans-serif",
          fontWeight: 700,
          fontSize: 38,
          textColor: '#ffffff',
          backgroundColor: 'rgba(0, 0, 0, 0.6)',
          backgroundPadding: '14px 28px',
          borderRadius: 16,
          framesPerWord: dynamicFramesPerWord,
          maxWidth: '85%',
        }}
        timestamps={captionTimestamps}
        fps={fps}
      />

      {/* Audio */}
      {scene?.audio?.file && <Audio src={scene.audio.file} />}
    </AbsoluteFill>
  );
});

Template061.displayName = 'Template061';

export default Template061;
