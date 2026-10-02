import React from 'react';
import { layerStyle, clampIntensity } from './shared';

export const id = 'dots';

const COLS = 10;
const ROWS = 6;

/**
 * A fixed dot-grid with staggered pulsing opacity. Positions are a plain
 * grid (no rng needed - deterministic by construction), so this is the
 * cheapest/most minimal decoration, suited as the default for
 * content-dense or image scenes that shouldn't compete for attention.
 */
export const render = ({ frame = 0, palette, intensity = 0.2 } = {}) => {
  const opacity = clampIntensity(intensity);
  const color = palette?.textMuted || 'rgba(255,255,255,0.5)';

  const dots = [];
  for (let row = 0; row < ROWS; row++) {
    for (let col = 0; col < COLS; col++) {
      const x = ((col + 0.5) / COLS) * 100;
      const y = ((row + 0.5) / ROWS) * 100;
      const phase = (row * COLS + col) * 0.3;
      const pulse = 0.4 + 0.6 * (0.5 + 0.5 * Math.sin(frame * 0.03 + phase));
      dots.push({ key: `${row}-${col}`, x, y, pulse });
    }
  }

  return (
    <div style={layerStyle()}>
      {dots.map((d) => (
        <div
          key={d.key}
          style={{
            position: 'absolute',
            left: `${d.x}%`,
            top: `${d.y}%`,
            width: 4,
            height: 4,
            borderRadius: '50%',
            backgroundColor: color,
            opacity: opacity * d.pulse,
            transform: 'translate(-50%, -50%)',
          }}
        />
      ))}
    </div>
  );
};
