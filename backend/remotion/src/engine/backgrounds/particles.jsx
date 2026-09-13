import React from 'react';
import { createSeededRng, range } from '../seedRandom';
import { layerStyle, clampIntensity } from './shared';

export const id = 'particles';

const DEFAULT_COUNT = 18; // kept modest per the performance brief

/**
 * Subtle floating particles - deterministic seeded positions (no
 * Math.random() during render), drifting/pulsing via sine off the current
 * frame. `count` is configurable but defaults low to stay lightweight.
 */
export const render = ({ frame = 0, palette, intensity = 0.3, seed = 'particles', count = DEFAULT_COUNT } = {}) => {
  const rng = createSeededRng(`${seed}-particles`);
  const opacity = clampIntensity(intensity, 0.08, 0.6);
  const color = palette?.accent || '#ffffff';

  const particles = Array.from({ length: count }, (_, i) => {
    const x = range(rng, 2, 98);
    const y0 = range(rng, 2, 98);
    const size = range(rng, 2, 6);
    const speed = range(rng, 0.15, 0.4);
    const phase = range(rng, 0, Math.PI * 2);
    const drift = range(rng, 4, 10);
    const y = y0 + Math.sin(frame * 0.02 * speed + phase) * drift;
    const flicker = 0.5 + 0.5 * Math.sin(frame * 0.03 * speed + phase);
    return { key: i, x, y, size, particleOpacity: Math.max(0, opacity * flicker) };
  });

  return (
    <div style={layerStyle()}>
      {particles.map((p) => (
        <div
          key={p.key}
          style={{
            position: 'absolute',
            left: `${p.x}%`,
            top: `${p.y}%`,
            width: p.size,
            height: p.size,
            borderRadius: '50%',
            backgroundColor: color,
            opacity: p.particleOpacity,
            transform: 'translate(-50%, -50%)',
          }}
        />
      ))}
    </div>
  );
};
