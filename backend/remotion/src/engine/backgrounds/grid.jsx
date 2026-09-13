import React from 'react';
import { interpolate } from 'remotion';
import { layerStyle, clampIntensity } from './shared';

export const id = 'grid';

const CLAMP = { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' };
const CELL = 64;

/**
 * Animated technical grid - two repeating linear-gradient lines (CSS, no
 * SVG/canvas) that slowly scroll and gently pulse opacity. Suited to
 * technology/programming content per the design brief.
 */
export const render = ({ frame = 0, palette, intensity = 0.3 } = {}) => {
  const opacity = clampIntensity(intensity, 0.06, 0.5);
  const line = palette?.textMuted || 'rgba(255,255,255,0.4)';
  const shiftY = interpolate(frame % 240, [0, 240], [0, CELL], CLAMP);
  const pulse = interpolate(Math.sin(frame * 0.015), [-1, 1], [opacity * 0.7, opacity]);

  return (
    <div
      style={layerStyle({
        backgroundImage: `linear-gradient(${line} 1px, transparent 1px), linear-gradient(90deg, ${line} 1px, transparent 1px)`,
        backgroundSize: `${CELL}px ${CELL}px`,
        backgroundPosition: `0 ${shiftY}px`,
        opacity: pulse,
      })}
    />
  );
};
