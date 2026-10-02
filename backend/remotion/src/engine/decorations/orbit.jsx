import React from 'react';
import { createSeededRng, range } from '../seedRandom';
import { clampIntensity } from './shared';

export const id = 'orbit';

const RING_COUNT = 3;

/**
 * Concentric rings around a single seeded focal point, each with one dot
 * orbiting at its own rate/direction - an "AI/science/futuristic" motif per
 * the design brief. Pure trig off the current frame, no per-frame layout.
 */
export const render = ({ frame = 0, palette, intensity = 0.25, seed = 'orbit' } = {}) => {
  const rng = createSeededRng(`${seed}-orbit`);
  const opacity = clampIntensity(intensity);
  const color = palette?.accent || '#6c63ff';
  const cx = range(rng, 35, 65);
  const cy = range(rng, 30, 60);

  const rings = Array.from({ length: RING_COUNT }, (_, i) => {
    const radius = 12 + i * 9;
    const speed = range(rng, 0.2, 0.5) * (i % 2 === 0 ? 1 : -1);
    const angle = (frame * speed * Math.PI) / 180;
    return {
      key: i,
      radius,
      dotX: cx + radius * Math.cos(angle),
      dotY: cy + radius * Math.sin(angle),
    };
  });

  return (
    <svg
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
      style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }}
    >
      {rings.map((r) => (
        <g key={r.key}>
          <circle cx={cx} cy={cy} r={r.radius} fill="none" stroke={color} strokeWidth="0.25" opacity={opacity * 0.6} />
          <circle cx={r.dotX} cy={r.dotY} r="1" fill={color} opacity={Math.min(0.9, opacity * 1.3)} />
        </g>
      ))}
    </svg>
  );
};
