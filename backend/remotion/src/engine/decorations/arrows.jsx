import React from 'react';
import { interpolate } from 'remotion';
import { createSeededRng, range, pick } from '../seedRandom';
import { clampIntensity } from './shared';

export const id = 'arrows';

const CLAMP = { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' };
const DEFAULT_COUNT = 4;
const DIRECTIONS = [0, 45, 90, 135, 180, -45, -90, -135];

/**
 * A handful of small directional arrows that draw on (opacity ramp) then
 * pulse gently - useful for tutorial/process/step-by-step content per the
 * design brief.
 */
export const render = ({ frame = 0, palette, intensity = 0.25, seed = 'arrows', count = DEFAULT_COUNT } = {}) => {
  const rng = createSeededRng(`${seed}-arrows`);
  const opacity = clampIntensity(intensity);
  const color = palette?.accent || '#ffffff';

  const arrows = Array.from({ length: count }, (_, i) => {
    const x = range(rng, 10, 90);
    const y = range(rng, 10, 90);
    const rotate = pick(rng, DIRECTIONS);
    const delay = range(rng, 0, 40);
    const size = range(rng, 6, 12);
    const pulse = interpolate(Math.sin(frame * 0.03 + i), [-1, 1], [0.5, 1]);
    const reveal = interpolate(frame, [delay, delay + 30], [0, 1], CLAMP);
    return { key: i, x, y, rotate, size, opacity: opacity * pulse * reveal };
  });

  return (
    <svg
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
      style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }}
    >
      {arrows.map((a) => (
        <g key={a.key} transform={`translate(${a.x} ${a.y}) rotate(${a.rotate})`} opacity={a.opacity}>
          <line x1={-a.size / 2} y1={0} x2={a.size / 2} y2={0} stroke={color} strokeWidth="0.4" />
          <polyline points={`${a.size / 2 - 2},${-1.5} ${a.size / 2},0 ${a.size / 2 - 2},1.5`} fill="none" stroke={color} strokeWidth="0.4" />
        </g>
      ))}
    </svg>
  );
};
