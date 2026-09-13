import React from 'react';
import { createSeededRng, range, pick } from '../seedRandom';
import { clampIntensity } from './shared';

export const id = 'geometric';

const SHAPES = ['circle', 'ring', 'triangle', 'hexagon', 'diagonal'];
const DEFAULT_COUNT = 5;

const renderShape = (shape, x, y, size, rotate, color, opacity, key) => {
  const transform = `translate(${x} ${y}) rotate(${rotate})`;
  if (shape === 'circle') {
    return <circle key={key} cx={0} cy={0} r={size / 2} fill={color} opacity={opacity} transform={transform} />;
  }
  if (shape === 'ring') {
    return <circle key={key} cx={0} cy={0} r={size / 2} fill="none" stroke={color} strokeWidth="0.4" opacity={opacity} transform={transform} />;
  }
  if (shape === 'triangle') {
    const h = size * 0.87;
    return <polygon key={key} points={`0,${-h / 2} ${size / 2},${h / 2} ${-size / 2},${h / 2}`} fill={color} opacity={opacity} transform={transform} />;
  }
  if (shape === 'hexagon') {
    const points = Array.from({ length: 6 }, (_, i) => {
      const a = (Math.PI / 3) * i;
      return `${((size / 2) * Math.cos(a)).toFixed(2)},${((size / 2) * Math.sin(a)).toFixed(2)}`;
    }).join(' ');
    return <polygon key={key} points={points} fill="none" stroke={color} strokeWidth="0.4" opacity={opacity} transform={transform} />;
  }
  return <line key={key} x1={-size / 2} y1={-size / 2} x2={size / 2} y2={size / 2} stroke={color} strokeWidth="0.4" opacity={opacity} transform={transform} />;
};

/**
 * A small scattering of abstract geometric primitives (circle/ring/
 * triangle/hexagon/diagonal), each rotating very slowly at its own seeded
 * rate. Renders as plain SVG shapes, no images or filters.
 */
export const render = ({ frame = 0, palette, intensity = 0.25, seed = 'geometric', count = DEFAULT_COUNT } = {}) => {
  const rng = createSeededRng(`${seed}-geometric`);
  const opacity = clampIntensity(intensity);
  const color = palette?.accent || '#ffffff';

  const shapes = Array.from({ length: count }, (_, i) => {
    const shape = pick(rng, SHAPES);
    const x = range(rng, 6, 94);
    const y = range(rng, 6, 94);
    const size = range(rng, 4, 10);
    const rotationSpeed = range(rng, -0.15, 0.15);
    const rotate = frame * rotationSpeed;
    return { shape, x, y, size, rotate, key: i };
  });

  return (
    <svg
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
      style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }}
    >
      {shapes.map((s) => renderShape(s.shape, s.x, s.y, s.size, s.rotate, color, opacity, s.key))}
    </svg>
  );
};
