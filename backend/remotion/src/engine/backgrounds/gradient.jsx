import React from 'react';
import { interpolate } from 'remotion';
import { layerStyle, clampIntensity } from './shared';

export const id = 'gradient';

const CLAMP = { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' };
const LOOP_FRAMES = 360; // ~12s at 30fps, long enough not to read as looping

/**
 * Slow diagonal gradient drift - angle and stop position both ease via
 * sine instead of snapping, keeping the movement subtle/professional per
 * the design brief rather than a fast animated background.
 */
export const render = ({ frame = 0, palette, intensity = 0.3 } = {}) => {
  const t = ((frame % LOOP_FRAMES) + LOOP_FRAMES) % LOOP_FRAMES / LOOP_FRAMES;
  const angle = 120 + Math.sin(t * Math.PI * 2) * 20;
  const stop = interpolate(Math.sin(t * Math.PI * 2), [-1, 1], [35, 65], CLAMP);
  const bg = palette?.bg || '#111111';
  const accent = palette?.accent || '#6c63ff';

  return (
    <div
      style={layerStyle({
        background: `linear-gradient(${angle}deg, ${bg} 0%, ${accent} ${stop}%, ${bg} 100%)`,
        opacity: clampIntensity(intensity, 0.1, 0.7),
      })}
    />
  );
};
