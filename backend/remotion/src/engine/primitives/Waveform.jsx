import React, { useMemo } from 'react';
import { interpolate, useCurrentFrame } from 'remotion';

/**
 * Decorative audio-wave bars for podcast strategies (see solveLayout's
 * buildPodcastSplit/buildPodcastCentered `waveform` position), positioned
 * per the Layout Solver's geometry. Purely cosmetic - not driven by actual
 * audio amplitude, same sin-wave placeholder animation
 * templates/001-podcast and 002-podcast already use.
 */
export const Waveform = ({ waveform, stylePlan }) => {
  const frame = useCurrentFrame();
  const bars = useMemo(() => [0, 1, 2, 3, 4], []);

  if (!waveform) return null;

  const positionStyle = {
    position: 'absolute',
    left: `${waveform.xPct * 100}%`,
    top: `${waveform.yPct * 100}%`,
    width: `${waveform.wPct * 100}%`,
    height: 40,
    display: 'flex',
    alignItems: 'center',
    gap: 6,
  };

  const opacity = interpolate(frame, [30, 45], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });

  return (
    <div style={{ ...positionStyle, opacity }}>
      {bars.map((i) => {
        const height = interpolate(Math.sin(frame * 0.08 + i * 1.2), [-1, 1], [8, 32]);
        return (
          <div
            key={i}
            style={{ width: 4, height, borderRadius: 2, backgroundColor: stylePlan.palette.accent, opacity: 0.85 }}
          />
        );
      })}
    </div>
  );
};
